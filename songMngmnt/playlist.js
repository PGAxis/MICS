import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const playlistsDir = path.join(__dirname, "../playlists");

function safeName(name) {
  return name.replace(/[^a-z0-9_-]/gi, "_");
}


if (!fs.existsSync(playlistsDir)) fs.mkdirSync(playlistsDir);

function listPlaylists() {
  const files = fs.readdirSync(playlistsDir);
  return files
    .filter(f => f.endsWith(".json"))
    .map(f => {
      const data = JSON.parse(fs.readFileSync(path.join(playlistsDir, f), "utf8"));
      return { name: data.name, songs: data.songs };
    });
}

function listPlaylist(name) {
  if (!name) return null;
  const filePath = path.join(playlistsDir, `${safeName(name)}.json`)

  if (fs.existsSync(filePath)) {
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return { name: data.name, songs: data.songs };
  } else {
    return null;
  }
}

function createPlaylist(name) {
  if (!name) throw new Error("No name provided");
  const filePath = path.join(playlistsDir, `${safeName(name)}.json`);
  if (fs.existsSync(filePath)) throw new Error("Playlist already exists");

  const data = { name, songs: [] };
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  return data;
}

function addSongToPlaylist(playlistName, songId, index = null) {
  if (!playlistName) throw new Error("No name provided");
  const filePath = path.join(playlistsDir, `${safeName(playlistName)}.json`);
  if (!fs.existsSync(filePath)) throw new Error("Playlist not found");

  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));

  if (isSongInPlaylist(playlistName, songId)) return data;

  index = index ?? data.songs.length + 1;
  const songEntry = { id: songId, index: index };

  data.songs.forEach(song => {
    if (song.index >= index) {
      song.index += 1;
    }
  });

  data.songs.push(songEntry);

  data.songs.sort((a, b) => a.index - b.index);

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  return data;
}

function removeSongFromPlaylist(playlistName, songId) {
  if (!playlistName) throw new Error("No name provided");
  const filePath = path.join(playlistsDir, `${safeName(playlistName)}.json`);
  if (!fs.existsSync(filePath)) throw new Error("Playlist not found");

  const data = JSON.parse(fs.readFileSync(filePath), "utf8");

  const song = data.songs.find(s => s.id === songId);
  const songIndex = song ? song.index : null;

  data.songs = data.songs.filter(s => s.id !== songId);

  if (songIndex) {
    data.songs.forEach(song => {
      if (song.index > songIndex) {
        song.index -= 1;
      }
    });
  }

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  return data;
}

function removePlaylist(playlistName) {
  if (!playlistName) return 404;
  const filePath = path.join(playlistsDir, `${safeName(playlistName)}.json`);

  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    console.log("Removed playlist: ", playlistName);
    return 200;
  } else {
    return 404;
  }
}

function isSongInPlaylist(playlistName, songId) {
  if (!playlistName) throw new Error("No name provided");
  const filePath = path.join(playlistsDir, `${safeName(playlistName)}.json`);
  if (!fs.existsSync(filePath)) throw new Error("Playlist not found");

  const data = JSON.parse(fs.readFileSync(filePath));

  return data.songs.some(song => song.id === songId);
}

export {
    listPlaylists,
    listPlaylist,
    createPlaylist,
    addSongToPlaylist,
    removeSongFromPlaylist,
    removePlaylist
};