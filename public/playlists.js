const PTemplate = document.getElementById("playlist-template");
const PITemplate = document.getElementById("playlist-item-template");
const plist = document.getElementById("playlist-list");
const plistView = document.getElementById("playlist-view");
const pilist = document.getElementById("playlist-songs");
const playlistDiv = document.getElementById("playlist-div");
const overlay = document.getElementById("overlay");
const input = document.getElementById("name-bar");
const backBtn = document.getElementById("playlist-back");
const playPauseBtn = document.getElementById("play-pause");
const addPlist = document.getElementById("add-plist");
const menuBack = document.getElementById("menu-back");
const finalAdd = document.getElementById("final-add");
const playlistPlay = document.getElementById("playlist-play");
const prev = document.getElementById("prev");
const next = document.getElementById("next");
const repeatBtn = document.getElementById("repeat");
const playlistShuffle = document.getElementById("shuffle-play");
const volumeBtn = document.getElementById("volume-btn");
const volumePanel = document.getElementById("volume-panel");
const volumeSlider = document.getElementById("volume-slider");
const existsDiv = document.getElementById("exists");

let oldPlaylists = [];

let currPlaylist = null;

let imageObserver = null;

let lastVolume = 0;

backBtn.addEventListener("click", () => {
  currPlaylist = null;
  plistView.hidden = true;
  playlistDiv.hidden = false;
});

playPauseBtn.addEventListener("click", async () => {
  fetch("/api/player/toggle", {
    method: "POST",
    headers: { "Content-Type": "application/json" }
  });
  await updateCurrSong();
});

addPlist.addEventListener("click", () => {
  overlay.style.display = "flex";
  document.body.classList.add("no-scroll");
});

menuBack.addEventListener("click", () => {
  overlay.style.display = "none";
  document.body.classList.remove("no-scroll");
});

finalAdd.addEventListener("click", async () => {
  const name = input.value.trim();

  if (!name || name === "") {
    input.value = "";
    return;
  }

  const res = await fetch(`/api/playlist/exists/${name}`);
  const { exists } = await res.json();

  if (exists) {
    existsDiv.hidden = false;
    return;
  }

  fetch("/api/playlists", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: name })
  });

  input.value = "";
  existsDiv.hidden = true;
  overlay.style.display = "none";
  document.body.classList.remove("no-scroll");
});

playlistPlay.addEventListener("click", () => {
  if (!currPlaylist) return;
  fetch("/api/queue/playlist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ playlist: currPlaylist, shuffle: false })
  });
});

prev.addEventListener("click", async () => {
  fetch("/api/player/prev", {
    method: "POST",
    headers: { "Content-Type": "application/json" }
  });
  await updateCurrSong();
});

next.addEventListener("click", async () => {
  fetch("/api/player/next", {
    method: "POST",
    headers: { "Content-Type": "application/json" }
  });
  await updateCurrSong();
});

repeatBtn.addEventListener("click", async () => {
  fetch("/api/queue/repeat", {
    method: "POST",
    headers: { "Content-Type": "application/json" }
  });
  await updateCurrSong();
});

playlistShuffle.addEventListener("click", () => {
  if (!currPlaylist) return;
  fetch("/api/queue/playlist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ playlist: currPlaylist, shuffle: true })
  });
});

volumeBtn.addEventListener("click", async () => {
  volumePanel.classList.toggle("hidden");

  if (!volumePanel.classList.contains("hidden")) {
    const res = await fetch("/api/player/volume");
    const { volume } = await res.json();

    volumeSlider.value = volume;
  }
});

volumeSlider.addEventListener("input", () => {
  setVolIcon(volumeSlider.value);
  fetch("/api/player/volume", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ volume: volumeSlider.value })
  });
});

function volumeIcon(vol) {
  if (vol === 0) return "/icons/volume-off.svg";
  if (vol < 40) return "/icons/volume-low.svg";
  return "/icons/volume-high.svg";
}

function setVolIcon(vol) {
  const volBtn = document.querySelector("#volume-btn img");
  volBtn.src = volumeIcon(vol);
}

function formatDuration(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2,'0')}:${secs.toString().padStart(2,'0')}`;
  } else {
    return `${mins}:${secs.toString().padStart(2,'0')}`;
  }
}

function renderPlaylists(playlists) {
  plist.innerHTML = "";

  playlists.forEach(playlist => {
    const node = PTemplate.content.cloneNode(true);

    let mainId = -1;

    if (playlist.songs.length >= 1) {
      mainId = playlist.songs.find(s => s.index == 1).id;
    }

    const frame = node.querySelector(".song-item");
    frame.addEventListener("click", () => {
      playlistDiv.hidden = true;
      plistView.hidden = false;
      currPlaylist = playlist;
      loadOnePLaylist(playlist);
    });

    const img = node.querySelector(".song-cover");
    if (mainId === -1) {
      img.dataset.src = "/covers/placeholder-playlist.png";
    } else {
      img.dataset.src = `/covers/${mainId}.jpg`;
    }
    img.src = "/placeholder-playlist.png";

    node.querySelector(".song-name").textContent = playlist.name;

    const addBtn = node.querySelector(".song-btn");
    addBtn.addEventListener("click", () => {
      event.stopPropagation();
      fetch("/api/playlists/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: playlist.name })
      });
      loadPlaylist()
    });

    plist.appendChild(node);
  });

  observeImages();
}

async function loadOnePLaylist(playlist) {
  pilist.innerHTML = "";

  const name = playlist.name;
  const songs = [...playlist.songs].sort((a, b) => a.index - b.index);

  const title = document.getElementById("playlist-name");
  title.textContent = name;

  const songData = await Promise.all(
    songs.map(song =>
    fetch(`/api/songById/${song.id}`)
    .then(res => res.ok ? res.json() : null)
    .catch(() => null)
    )
  );

  songs.forEach((song, i) => {
    const realSong = songData[i];
    const node = PITemplate.content.cloneNode(true);

    const img = node.querySelector(".song-cover");
    img.dataset.src = `/covers/${song.id}.jpg`;
    img.src = "/placeholder.png";

    node.querySelector(".song-name").textContent = realSong.name;
    node.querySelector(".song-artist").textContent = realSong.artist;
    node.querySelector(".song-duration").textContent = formatDuration(realSong.duration);

    const playBtn = node.querySelector(".song-btn");
    playBtn.addEventListener("click", () => {
      fetch(`/api/playlists/${encodeURIComponent(name)}/remove`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ songId: song.id })
      });
      reloadOnePlaylist(playlist.name);
    });

    pilist.appendChild(node);
  });

  observeImages();
}

async function reloadOnePlaylist(name) {
  const res = await fetch(`/api/playlist/${encodeURIComponent(name)}`);
  const playlist = await res.json();

  if (!isPlaylistEqual(playlist, currPlaylist)) {
    loadOnePLaylist(playlist);
    currPlaylist = playlist;
  }
}

function initLazyLoading() {
  if (imageObserver) return;

  imageObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const img = entry.target;
        img.src = img.dataset.src;
        img.removeAttribute("data-src");
        observer.unobserve(img);
      }
    });
  }, {
    root: null,
    rootMargin: "0px",
    threshold: 0.1
  });
}

function observeImages() {
  initLazyLoading();

  document
    .querySelectorAll(".song-cover[data-src]")
    .forEach(img => imageObserver.observe(img));
}

async function loadPlaylist() {
  try {
    const res = await fetch("/api/playlists");
    const playlists = await res.json();
    if (!arePlaylistsEqual(playlists, oldPlaylists)) {
      renderPlaylists(playlists);
      oldPlaylists = playlists;
    }
  } catch (err) {
    console.error("Failed to load playlists:", err);
  }
}

function arePlaylistsEqual(a, b) {
  if (a.length !== b.length) return false;
  return a.every((pl, i) => pl.name === b[i].name);
}

function isPlaylistEqual(a, b) {
  if (a.songs.length !== b.songs.length) return false;
  return a.songs.every((sg, i) => sg.id === b.songs[i].id)
}

document.addEventListener("DOMContentLoaded", () => {
  loadPlaylist();
});

function updateProgress(position, duration) {
  if (!duration) {
    document.getElementById("progress-bar").style.setProperty("--progress", "0%");
    return;
  }
  const percent = (position / duration) * 100;
  document.getElementById("progress-bar").style.setProperty("--progress", `${percent}%`);
}

async function updateCurrSong() {
  const cover = document.getElementById("player-song-cover");
  const name = document.getElementById("player-name");
  const artist = document.getElementById("player-artist");

  const playPause = document.querySelector("#play-pause img");
  const repeat = document.querySelector("#repeat img");

  try {
    const res = await fetch("/api/player/state");
    const data = await res.json();

    if (data.isPlaying) {
      playPause.src = "/icons/pause.svg";
      cover.src = `/covers/${data.currentSong.id}.jpg`;
      name.textContent = data.currentSong.name;
      artist.textContent = data.currentSong.artist;
      updateProgress(data.position, data.duration);
    } else {
      playPause.src = "/icons/play.svg"
      updateProgress(data.position, data.duration);
      if (!data.currentSong) {
        cover.src = "/placeholder.png";
        name.textContent = "No current song";
        artist.textContent = "No current song";
      } else {
        cover.src = `/covers/${data.currentSong.id}.jpg`;
        name.textContent = data.currentSong.name;
        artist.textContent = data.currentSong.artist;
      }
    }

    if (data.isRepeating) {
      repeat.src = "/icons/repeat.svg";
    } else {
      repeat.src = "/icons/continue-q.svg";
    }

    if (data.volume !== null && data.volume !== lastVolume) {
      setVolIcon(data.volume);
     volumeSlider.value = data.volume;
    }
  } catch (err) {
    console.error(err);
  }
}

async function keepPageUpdated() {
  await loadPlaylist();
  await updateCurrSong();
  if (currPlaylist !== null) {
    await reloadOnePlaylist(currPlaylist.name);
  }
}

setInterval(keepPageUpdated, 500);
