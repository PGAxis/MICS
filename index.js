import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import { fileTypeFromFile } from "file-type";
import db from "./db/database.js";
import { scanSongs, addSongs } from "./songMngmnt/scanSongs.js";
import * as player from "./songMngmnt/playSong.js";
import * as dbHelper from "./songMngmnt/databaseSearch.js";
import * as playlist from "./songMngmnt/playlist.js";
import * as queueHelper from "./songMngmnt/queue.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const upload = multer({ dest: "/tmp/uploads" });

const MUSIC_FOLDER = path.join(__dirname, "songs");

const CFG_PATH = path.join(__dirname, "config.json");
let cfg = JSON.parse(fs.readFileSync(CFG_PATH));

let libraryVersion = 0;

let stopping = false;

const server = express();
const PORT = 3000;

player.onSongEnd(async () => {
  if (!stopping) await queueHelper.autoDequeue();
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
        await queueHelper.playlistChanged(pl, { id: songId, index: index });
        res.status(200).json(pl);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

server.post("/api/playlists/:name/remove", async (req, res) => {
    try {
        const { songId } = req.body;
        const pl = playlist.removeSongFromPlaylist(req.params.name, songId);
        await queueHelper.playlistChanged(pl, { id: songId });
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
  const queue = queueHelper.getQueue();
  res.status(200).json(queue);
});

server.post("/api/queue/playlist", async (req, res) => {
  const { playlist, shuffle } = req.body;

  await queueHelper.initPlaylistQueue(playlist, shuffle);

  res.status(200).json({ success: true });
});

server.post("/api/queue/add", async (req, res) => {
  const { id, index } = req.body;

  await queueHelper.apiEnqueue(id, index);

  res.status(200).json({ success: true });
});

server.post("/api/queue/remove", async (req, res) => {
  const { id, index } = req.body;

  await queueHelper.apiDequeue(id, index);

  res.status(200).json({ success: true });
});

server.post("/api/queue/repeat", (req, res) => {
  queueHelper.toggleRepeat();

  res.status(200).json({ success: true });
});

// ---------- Player ----------
server.post("/api/player/play", async (req, res) => {
  const {id} = req.body;

  const ret = await queueHelper.apiPlay(id);

  if (ret === 0) return res.status(404).json({ success: false });

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
  await queueHelper.autoDequeue();

  res.status(200).json({ success: true });
});

server.post("/api/player/prev", async (req, res) => {
  await queueHelper.apiPrev();

  res.status(200).json({ success: true });
});

server.post("/api/player/volume", async (req, res) => {
  const { volume } = req.body;
  await player.setVolume(volume);
  cfg.volume = Math.max(0, Math.min(100, volume));
  res.status(200).json({ success: true });
});

server.get("/api/player/state", async (req, res) => {
  res.status(200).json(await player.getState());
});

server.get("/api/player/volume", async (req, res) => {
  const volume = await player.getVolume();
  res.status(200).json({ volume });
});

// ---------- Upload/Library ----------

server.get("/api/library", (req, res) => {
  res.status(200).json({ version: libraryVersion });
});

server.post("/api/upload", upload.array("songs"), async (req, res) => {
  const songs = [];

  for (const file of req.files) {
    const type = await fileTypeFromFile(file.path);

    if (!type || type.mime !== "audio/mpeg") {
      fs.unlinkSync(file.path);
      continue;
    }

    const fileName = path.join(MUSIC_FOLDER, file.originalname);

    if (!fs.existsSync(fileName)) {
      fs.renameSync(
        file.path,
        fileName
      );

      songs.push(fileName);
    }
  }

  await addSongs(songs);
  libraryVersion++;

  res.status(200).json({ success: true });
});

// ---------- Server Stuff ----------

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function loadCfg() {
  await player.start();
  await sleep(500);
  await player.setVolume(cfg.volume);
  await player.stop();

  await queueHelper.apiLoadConfig(cfg);
}

const srvr = server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}\n`);
});

await loadCfg();

process.stdin.setEncoding("utf8");

process.stdin.on("data", async (data) => {
  const cmd = data.trim();

  if (cmd === "stop") {
    console.log("\nShutdown command recieved");
    await shutdown();
  }
});

async function shutdown() {
  stopping = true;

  console.log("\n\nSaving...");
  
  const state = await player.getState();
  const pos = state.position;
  
  await player.resume();
  await player.stop();

  await sleep(1000);

  await player.quit();

  await sleep(1000);

  const queueItem = queueHelper.getQueueItem();

  cfg.queue = queueItem.queue;
  cfg.lastPos = pos || 0;
  cfg.history = queueItem.history;
  cfg.repeatQueue = queueItem.repeatQueue;
  cfg.playlistPlaying = queueItem.playlistPlaying;
  cfg.useShuffle = queueItem.useShuffle;
  cfg.playlistInUse = queueItem.playlistInUse;

  fs.writeFileSync(CFG_PATH, JSON.stringify(cfg, null, 2));

  console.log("\nShutting down...");

  srvr.close(() => {
    console.log("\nServer stopped.");
    process.exit(0);
  });

  setTimeout(() => {
    console.warn("\nForced server stop.");
    process.exit(0);
  }, 2000);
}