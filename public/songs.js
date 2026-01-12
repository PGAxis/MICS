const template = document.getElementById("song-template");
const PTemplate = document.getElementById("playlist-template");
const list = document.getElementById("songs-list");
const playPauseBtn = document.getElementById("play-pause");
const overlay = document.getElementById("overlay");
const menuBack = document.getElementById("menu-back");
const addToPlist = document.getElementById("add-to-plist");
const addToQ = document.getElementById("add-to-q");
const choiceDiv = document.getElementById("choice-div");
const plistDiv = document.getElementById("plist-div");
const plist = document.getElementById("playlists-div");
const prev = document.getElementById("prev");
const next = document.getElementById("next");
const repeatBtn = document.getElementById("repeat");

let imageObserver = null;

let workedOnSong = [];

playPauseBtn.addEventListener("click", async () => {
  fetch("/api/player/toggle", {
    method: "POST",
    headers: { "Content-Type": "application/json" }
  });
  await updateCurrSong();
});

menuBack.addEventListener("click", () => {
  overlay.style.display = "none";
  document.body.classList.remove("no-scroll");
});

addToPlist.addEventListener("click", () => {
  choiceDiv.hidden = true;
  plistDiv.hidden = false;
});

addToQ.addEventListener("click", () => {
  fetch("/api/queue/add", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: workedOnSong.id })
  });
  overlay.style.display = "none";
  document.body.classList.remove("no-scroll");
});

prev.addEventListener("click", () => {
  fetch("/api/player/prev", {
    method: "POST",
    headers: { "Content-Type": "application/json" }
  });
});

next.addEventListener("click", () => {
  fetch("/api/player/next", {
    method: "POST",
    headers: { "Content-Type": "application/json" }
  });
});

repeatBtn.addEventListener("click", async () => {
  fetch("/api/queue/repeat", {
    method: "POST",
    headers: { "Content-Type": "application/json" }
  });
  await updateCurrSong();
});

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

function renderSongs(songs) {
  list.innerHTML = "";

  songs.forEach(song => {
    const node = template.content.cloneNode(true);

    const img = node.querySelector(".song-cover");
    img.dataset.src = `/covers/${song.id}.jpg`;
    img.src = "/placeholder.png";

    node.querySelector(".song-name").textContent = song.name;
    node.querySelector(".song-artist").textContent = song.artist;
    node.querySelector(".song-duration").textContent = formatDuration(song.duration);

    const addBtn = node.querySelector(".add-btn");
    addBtn.addEventListener("click", () => {
      workedOnSong = song;
      document.body.classList.add("no-scroll");
      choiceDiv.hidden = false;
      plistDiv.hidden = true;
      loadPlaylist();
      overlay.style.display = "flex";
    });

    const playBtn = node.querySelector(".play-btn");
    playBtn.addEventListener("click", () => {
      console.log("play clicked");
      updateCurrSong();
      fetch("/api/player/play", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: song.id })
      });
    });

    list.appendChild(node);
  });

  observeImages();
}

function renderPlaylists(playlists) {
  plist.innerHTML = "";

  playlists.forEach(playlist => {
    const node = PTemplate.content.cloneNode(true);

    let mainId = -1;

    if (playlist.songs.length >= 1) {
      mainId = playlist.songs.find(s => s.index == 1).id;
    }

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
      fetch(`/api/playlists/${encodeURIComponent(playlist.name)}/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ songId: workedOnSong.id })
      });
      overlay.style.display = "none";
      document.body.classList.remove("no-scroll");
    });

    plist.appendChild(node);
  });

  observeImages();
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

async function loadSongs() {
  try {
    const res = await fetch("/api/songs");
    const songs = await res.json();
    renderSongs(songs);
  } catch (err) {
    console.error("Failed to load songs:", err);
  }
}

async function loadPlaylist() {
  try {
    const res = await fetch("/api/playlists");
    const playlists = await res.json();
    renderPlaylists(playlists);
  } catch (err) {
    console.error("Failed to load playlists:", err);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadSongs();
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
  } catch (err) {
    console.error(err);
  }
}

async function keepPageUpdated() {
  updateCurrSong();
}

setInterval(keepPageUpdated, 500);
