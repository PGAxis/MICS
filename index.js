import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import db from "./db/database.js";
import { scanSongs } from "./songMngmnt/scanSongs.js";
import * as player from "./songMngmnt/playSong.js";
import * as dbHelper from "./songMngmnt/databaseSearch.js";
import * as playlist from "./songMngmnt/playlist.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const server = express();
const PORT = 3000;

let queue = [];
let oldQueue = [];
let repeatQueue = false;

let history = [];

let playlistPlaying = false;
let useShuffle = false;
let playlistInUse = null;

player.onSongEnd(async () => {
  await autoDequeue();
})

const commandQueue = [];
let isProcessing = false;

server.use(express.static("public"));

await scanSongs();

server.use(express.json());

server.use("/covers", express.static("covers"));

// ---------- Pages ----------

server.get("/", (req, res) => {
  res.redirect("/songs");
});

server.get("/songs", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "songs.html"));
});

server.get("/playlists", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "playlists.html"));
});

server.get("/queue", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "queue.html"));
});

// ---------- Songs ----------

server.get("/api/songs", (req, res) => {
  const songs = db.prepare("SELECT * FROM songs ORDER BY id").all();
  res.status(200).json(songs.sort((a, b) => a.artist.toLowerCase().localeCompare(b.artist.toLowerCase())));
});

server.get("/api/songById/:id", (req, res) => {
  const id = Number(req.params.id);
  
  const song = dbHelper.songByID(id);
  
  if (!song) {
    return res.status(404).json({ error: "Song not found" });
  }
  
  res.status(200).json(song);
});

// ---------- Playlists ----------

server.get("/api/playlists", (req, res) => {
    try {
        const list = playlist.listPlaylists();
        res.status(200).json(list);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

server.get("/api/playlist/:name", (req, res) => {
    try {
        const name = req.params.name;
        const pl = playlist.listPlaylist(name);
        res.status(200).json(pl);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

server.post("/api/playlists", (req, res) => {
    try {
        const { name } = req.body;
        const pl = playlist.createPlaylist(name);
        res.status(200).json(pl);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

server.post("/api/playlists/:name/add", async (req, res) => {
    try {
        const { songId, index } = req.body;
        const pl = playlist.addSongToPlaylist(req.params.name, songId, index);
        await playlistChanged(pl, { id: songId, index: index });
        res.status(200).json(pl);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

server.post("/api/playlists/:name/remove", async (req, res) => {
    try {
        const { songId } = req.body;
        const pl = playlist.removeSongFromPlaylist(req.params.name, songId);
        await playlistChanged(pl, { id: songId });
        res.status(200).json(pl);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

server.post("/api/playlists/remove", (req, res) => {
    try {
        const { name } = req.body;
        const stat = playlist.removePlaylist(name);
        res.status(stat);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// ---------- Queue ----------

server.get("/api/queue", (req, res) => {
  res.status(200).json(queue);
});

server.post("/api/queue/playlist", async (req, res) => {
  const { playlist, shuffle } = req.body;

  playlistPlaying = false;
  useShuffle = false;
  playlistInUse = null;

  await initPlaylistQueue(playlist, shuffle);

  res.status(200).json({ success: true });
});

server.post("/api/queue/add", async (req, res) => {
  let { id, index } = req.body;

  oldQueue = [...queue];

  playlistPlaying = false;
  useShuffle = false;
  playlistInUse = null;

  enqueue(id, index);

  await queueChangedPlay();

  res.status(200).json({ success: true });
});

server.post("/api/queue/remove", async (req, res) => {
  let { id, index } = req.body;

  oldQueue = [...queue];

  playlistPlaying = false;
  useShuffle = false;
  playlistInUse = null;

  if (!index) {
    index = queue.find(s => s.id === id).index;
  }

  dequeue(id, index);

  if (index === 1) await queueChangedPlay();

  res.status(200).json({ success: true });
});

server.post("/api/queue/repeat", (req, res) => {
  toggleRepeat();

  res.status(200).json({ success: true });
});

// ---------- Player ----------
server.post("/api/player/play", async (req, res) => {
  const {id} = req.body;

  const song = dbHelper.songByID(id);
  if (!song) return res.sendStatus(404);

  const index = 1;

  oldQueue = [...queue];

  if (playlistPlaying) {
    playlistPlaying = false;
    useShuffle = false;
    playlistInUse = null;
    queue = [];
  }

  enqueue(id, index);

  await player.resume();

  await queueChangedPlay(true);

  res.status(200).json({ success: true });
});

server.post("/api/player/toggle", async (req, res) => {
  const state = await player.getState();

  if (state.isPlaying) {
    await player.pause();
  } else {
    await player.resume();
  }

  res.status(200).json(await player.getState());
});

server.post("/api/player/stop", async (req, res) => {
  const state = await player.getState();

  if (state.duration == 0 && state.position == 0) {
    await player.stop();
  }

  res.status(200).json({ success: true });
});

server.post("/api/player/next", async (req, res) => {
  await autoDequeue();

  res.status(200).json({ success: true });
});

server.post("/api/player/prev", async (req, res) => {
  const lastId = history.pop();

  if (lastId) {
    enqueue(lastId, 1);

    if (useShuffle) {
      oldQueue = [...queue];
      dequeue(queue.at(-1)?.id);
    }

    await queueChangedPlay(true);
  }

  res.status(200).json({ success: true });
});

server.get("/api/player/state", async (req, res) => {
  res.status(200).json(await player.getState());
});

// ---------- Server Stuff ----------

function enqueue(id, index = null) {
  if (!id) return;

  if (!index) {
    index = queue.length + 1;
  }

  queue.forEach(s => {
    if (s.index >= index) {
      s.index += 1;
    }
  });

  queue.push({ id: id, index: index});
  queue.sort((a, b) => a.index - b.index);
}

function dequeue(id, index = null) {
  if (!id) return;

  if (!index) {
    index = queue.find(s => s.id === id).index;
  }

  queue = queue.filter(s => !(s.id === id && s.index === index));
  queue.forEach(song => {
    if (song.index > index) {
      song.index -= 1;
    }
  });
  queue.sort((a, b) => a.index - b.index);
}

async function queueChangedPlay(force = false) {
  if (queue.length === 0) {
    await player.stop();
    return;
  }

  if (oldQueue.length === 0) {
    const song = dbHelper.songByID(queue[0].id);
    if (!song) return;
    await player.play(song);
    return;
  }

  if (force === true) {
    const song = dbHelper.songByID(queue[0].id);
    if (!song) return;
    await player.play(song);
    return;
  }

  if (oldQueue[0].id !== queue[0].id) {
    const song = dbHelper.songByID(queue[0].id);
    if (!song) return;
    await player.play(song);
  } else if (oldQueue.length > 1) {
    if (oldQueue[1].id === queue[0].id && queue.length !== oldQueue.length + 1) {
      const song = dbHelper.songByID(queue[0].id);
      if (!song) return;
      await player.play(song);
    }
  }
}

async function autoDequeue() {
  const current = queue[0];
  if (current) {
    history.push(current.id);
    if (history.length > 5) {
      history.shift();
    }
  }

  oldQueue = [...queue];

  queue = queue.filter(s => s.index !== 1);
  queue.forEach(song => {
    if (song.index > 1) {
      song.index -= 1;
    }
  });
  queue.sort((a, b) => a.index - b.index);

  if (repeatQueue && useShuffle === false) {
    const lastId = history.pop()

    if (lastId) {
      enqueue(lastId);
    }
  }

  if (repeatQueue && useShuffle) {
    const newSong = getRandomUnique(playlistInUse.songs, oldQueue);

    if (newSong) {
      enqueue(newSong.id);
    }
  }

  await queueChangedPlay();
}

async function initPlaylistQueue(playlist, shuffle) {
  playlistPlaying = true;
  toggleRepeat(true);
  useShuffle = shuffle ?? false;
  playlistInUse = playlist;

  oldQueue = [...queue];
  queue = [];

  await player.resume();

  if (!shuffle) {
    playlist.songs.forEach(song => {
      enqueue(song.id);
    });
  } else {
    const half = takeRandomHalf(playlist.songs);

    half.forEach(song => {
      enqueue(song.id);
    });
  }

  await queueChangedPlay(true);
}

async function playlistChanged(newPlaylist, changedSong) {
  if (playlistPlaying === true && playlistInUse.name === newPlaylist.name) {
    if (!shuffle) {
      if (newPlaylist.songs.length < playlistInUse.songs.length) {
        playlistInUse = newPlaylist;
  
        oldQueue = [...queue];
        dequeue(changedSong.id);
        await queueChangedPlay();
      } else {
        if (!changedSong.index) {
          playlistInUse = newPlaylist;
    
          prevIndex = newPlaylist.songs.length - 1;
  
          const prevSong = playlistInUse.songs.find(s => s.index === prevIndex);
          if (!prevSong) {
            enqueue(changedSong.id);
            await queueChangedPlay();
            return;
          }
  
          const queueIndex = queue.find(s => s.id === prevSong.id).index + 1;
  
          oldQueue = [...queue];
          enqueue(changedSong.id, queueIndex);
          await queueChangedPlay();
        } else {
          playlistInUse = newPlaylist;
  
          let prevIndex = changedSong.index - 1;
          if (prevIndex === 0) {
            prevIndex = newPlaylist.songs.length;
          }
          const prevSong = playlistInUse.songs.find(s => s.index === prevIndex);
  
          if (!prevSong) {
            enqueue(changedSong.id);
            await queueChangedPlay();
            return;
          }
  
          const queueIndex = queue.find(s => s.id === prevSong.id).index + 1;
          oldQueue = [...queue];
          enqueue(changedSong.id, queueIndex);
          await queueChangedPlay();
        }
      }
    } else {
      if (newPlaylist.songs.length < playlistInUse.songs.length) {
        playlistInUse = newPlaylist;
  
        oldQueue = [...queue];
        dequeue(changedSong.id);
        await queueChangedPlay();
      } else {
        if (Math.ceil(newPlaylist.songs.length / 2) > Math.ceil(playlistInUse.songs.length / 2)) {
          playlistInUse = newPlaylist;

          oldQueue = [...queue];

          const newSong = getRandomUnique();
          if (newSong) {
            enqueue(newSong.id);
          }
          await queueChangedPlay();
        }
      }
    }
  }
}

function toggleRepeat(repeat = null) {
  if (repeat) {
    repeatQueue = repeat;
  } else {
    repeatQueue = !repeatQueue;
  }
  player.setRepeatState(repeatQueue);
}

function takeRandomHalf(source) {
  const shuffled = [...source];

  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const half = Math.ceil(shuffled.length / 2);

  const target = [];

  for (let i = 0; i < half; i++) {
    target.push(shuffled[i]);
  }

  return target;
}

function getRandomUnique(source, target) {
  const existingIds = new Set(target.map(item => item.id));

  const available = source.filter(item => !existingIds.has(item.id));

  if (available.length === 0) return null;

  const picked = available[Math.floor(Math.random() * available.length)];

  return picked;
}

const srvr = server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

process.on("SIGINT", shutdown);

function shutdown() {
  console.log("\n\nShutting down...");

  srvr.close(() => {
    console.log("Server stopped.");
    process.exit(0);
  });
}