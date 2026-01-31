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
import { resolve } from "dns";

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

const cmds = {
  getSongs: 1,
  getSongId: 2,
  getPList: 3,
  getPListName: 4,
  makePList: 5,
  addToPlist: 6,
  rmFromPList: 7,
  rmPlist: 8,
  getQueue: 9,
  playPList: 10,
  addQueue: 11,
  rmQueue: 12,
  queueRepeat: 13,
  play: 14,
  toggle: 15,
  stop: 16,
  next: 17,
  prev: 18,
  setVolume: 19,
  state: 20,
  getVolume: 21,
  getLib: 22,
  upload: 23
}
const commandQueue = [];
let isProcessing = false;
const maxQueue = 100;

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

server.get("/api/songs", async (req, res) => {
  const result = await enqueueCommand(cmds.getSongs);
  res.status(200).json(result);
});

server.get("/api/songById/:id", async (req, res) => {
  const id = Number(req.params.id);
  
  const { success, code, content } = await enqueueCommand(cmds.getSongId, [id]);
  
  if (!success) {
    return res.status(code).json({ error: content });
  }
  
  res.status(code).json(content);
});

// ---------- Playlists ----------

server.get("/api/playlists", async (req, res) => {
    try {
        const list = await enqueueCommand(cmds.getPList);
        res.status(200).json(list);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

server.get("/api/playlist/:name", async (req, res) => {
    try {
        const name = req.params.name;
        const pl = await enqueueCommand(cmds.getPListName, [name]);
        res.status(200).json(pl);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

server.post("/api/playlists", async (req, res) => {
    try {
        const { name } = req.body;
        const pl = await enqueueCommand(cmds.makePList, [name]);
        res.status(200).json(pl);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

server.post("/api/playlists/:name/add", async (req, res) => {
    try {
        const { songId, index } = req.body;
        const pl = await enqueueCommand(cmds.addToPlist, [req.params.name, songId, index]);
        res.status(200).json(pl);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

server.post("/api/playlists/:name/remove", async (req, res) => {
    try {
        const { songId } = req.body;
        const pl = await enqueueCommand(cmds.rmFromPList, [req.params.name, songId]);
        res.status(200).json(pl);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

server.post("/api/playlists/remove", async (req, res) => {
    try {
        const { name } = req.body;
        const stat = await enqueueCommand(cmds.rmPlist, [name]);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// ---------- Queue ----------

server.get("/api/queue", async (req, res) => {
  const queue = await enqueueCommand(cmds.getQueue);
  res.status(200).json(queue);
});

server.post("/api/queue/playlist", async (req, res) => {
  const { playlist, shuffle } = req.body;

  await enqueueCommand(cmds.playPList, [playlist, shuffle]);

  res.status(200).json({ success: true });
});

server.post("/api/queue/add", async (req, res) => {
  const { id, index } = req.body;

  await enqueueCommand(cmds.addQueue, [id, index]);

  res.status(200).json({ success: true });
});

server.post("/api/queue/remove", async (req, res) => {
  const { id, index } = req.body;

  await enqueueCommand(cmds.rmQueue, [id, index]);

  res.status(200).json({ success: true });
});

server.post("/api/queue/repeat", async (req, res) => {
  await enqueueCommand(cmds.queueRepeat);

  res.status(200).json({ success: true });
});

// ---------- Player ----------

server.get("/api/player/state", async (req, res) => {
  const state = await enqueueCommand(cmds.state);
  res.status(200).json(state);
});

server.get("/api/player/volume", async (req, res) => {
  const volume = await enqueueCommand(cmds.getVolume);
  res.status(200).json({ volume });
});

server.post("/api/player/play", async (req, res) => {
  const { id } = req.body;

  const ret = await enqueueCommand(cmds.play, [id]);

  if (ret === 0) return res.status(404).json({ success: false });

  res.status(200).json({ success: true });
});

server.post("/api/player/toggle", async (req, res) => {
  await enqueueCommand(cmds.toggle);

  res.status(200).json(await player.getState());
});

server.post("/api/player/stop", async (req, res) => {
  await enqueueCommand(cmds.stop);

  res.status(200).json({ success: true });
});

server.post("/api/player/next", async (req, res) => {
  await enqueueCommand(cmds.next);

  res.status(200).json({ success: true });
});

server.post("/api/player/prev", async (req, res) => {
  await enqueueCommand(cmds.prev);

  res.status(200).json({ success: true });
});

server.post("/api/player/volume", async (req, res) => {
  const { volume } = req.body;
  await enqueueCommand(cmds.setVolume, [volume]);
  res.status(200).json({ success: true });
});

// ---------- Upload/Library ----------

server.get("/api/library", async (req, res) => {
  const version = await enqueueCommand(cmds.getLib);
  res.status(200).json({ version: version });
});

server.post("/api/upload", upload.array("songs"), async (req, res) => {
  await enqueueCommand(cmds.upload, [req.files]);

  res.status(200).json({ success: true });
});

// ---------- Server Stuff ----------

async function enqueueCommand(cmd, args) {
  if (commandQueue.length >= maxQueue) {
    return Promise.reject({
      status: 429,
      message: "Server busy, try again"
    });
  };

  return new Promise((resolve, reject) => {
    commandQueue.push({ cmd, args, resolve, reject });
    processCommandQueue();
  })
}

async function processCommandQueue() {
  if (isProcessing) return;
  isProcessing = true;

  while (commandQueue.length > 0) {
    const { cmd, args, resolve, reject } = commandQueue.shift();

    try {
      const result = await executeCommand(cmd, args);
      resolve(result);
    } catch (err) {
      reject(err);
    }
  }

  isProcessing = false;
}

async function executeCommand(cmd, args) {
  args = args || [];
  switch(cmd) {
    case cmds.getSongs:
      const songs = db.prepare("SELECT * FROM songs ORDER BY id").all();
      return songs.sort((a, b) => a.artist.toLowerCase().localeCompare(b.artist.toLowerCase()));
    case cmds.getSongId:
      const song = dbHelper.songByID(...args);
      if (!song) {
        return { success: false, code: 404, content: "Song not found" };
      }
      return { success: true, code: 200, content: song };
    case cmds.getPList:
      const list = playlist.listPlaylists();
      return list;
    case cmds.getPListName:
      const pl = playlist.listPlaylist(...args);
      return pl;
    case cmds.makePList:
      const plist = playlist.createPlaylist(...args);
      return plist;
    case cmds.addToPlist:
      const plst = playlist.addSongToPlaylist(...args);
      await queueHelper.playlistChanged(plst, { id: args[1], index: args[2] });
      return plst;
    case cmds.rmFromPList:
      const pist = playlist.removeSongFromPlaylist(...args);
      await queueHelper.playlistChanged(pist, { id: args[1] });
      return pist;
    case cmds.rmPlist:
      const stat = playlist.removePlaylist(...args);
      return stat;
    case cmds.getQueue:
      const queue = queueHelper.getQueue();
      return queue;
    case cmds.playPList:
      await queueHelper.initPlaylistQueue(...args);
      break;
    case cmds.addQueue:
      await queueHelper.apiEnqueue(...args);
      break;
    case cmds.rmQueue:
      await queueHelper.apiDequeue(...args);
      break;
    case cmds.queueRepeat:
      queueHelper.toggleRepeat();
      break;
    case cmds.play:
      const ret = await queueHelper.apiPlay(id);
      return ret;
    case cmds.toggle:
      const state = await player.getState();
      if (state.isPlaying) {
        await player.pause();
      } else {
        await player.resume();
      }
      break;
    case cmds.stop:
      const ste = await player.getState();
      if (ste.duration == 0 && ste.position == 0) {
        await player.stop();
      }
      break;
    case cmds.next:
      await queueHelper.autoDequeue();
      break;
    case cmds.prev:
      await queueHelper.apiPrev();
      break;
    case cmds.setVolume:
      const volume = args[0];
      await player.setVolume(...args);
      cfg.volume = Math.max(0, Math.min(100, volume));
      break;
    case cmds.state:
      return await player.getState();
    case cmds.getVolume:
      return await player.getVolume();
    case cmds.getLib:
      return libraryVersion;
    case cmds.upload:
      const files = args[0];
      const songes = [];
      for (const file of files) {
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
          songes.push(fileName);
        }
      }
      await addSongs(songes);
      libraryVersion++;
      break;
  }
}

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
  } else if (cmd === "pause") {
    await player.pause();
  } else if (cmd === "play") {
    await player.resume();
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