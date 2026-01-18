const QTemplate = document.getElementById("queue-template");
const queueList = document.getElementById("queue-list");
const playPauseBtn = document.getElementById("play-pause");
const prev = document.getElementById("prev");
const next = document.getElementById("next");
const repeatBtn = document.getElementById("repeat");
const volumeBtn = document.getElementById("volume-btn");
const volumePanel = document.getElementById("volume-panel");
const volumeSlider = document.getElementById("volume-slider");

let queue = [];

let imageObserver = null;

playPauseBtn.addEventListener("click", async () => {
  fetch("/api/player/toggle", {
    method: "POST",
    headers: { "Content-Type": "application/json" }
  });
  await updateCurrSong();
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

async function loadQueue() {
  const res = await fetch("/api/queue");
  const data = await res.json();

  if (!areQsEqual(queue, data)) {
    queue = data;
    updateQueueUI();
  }
}

function areQsEqual(a, b) {
  if (a.length !== b.length) return false;
  return a.every((pl, i) => pl.id === b[i].id);
}

async function updateQueueUI() {
  queueList.innerHTML = "";

  const songData = await Promise.all(
        [...queue].map(song =>
        fetch(`/api/songById/${song.id}`)
        .then(res => res.ok ? res.json() : null)
        .catch(() => null)
        )
    );

  queue.forEach((_, i) => {
    const song = songData[i]
    const node = QTemplate.content.cloneNode(true);

    const img = node.querySelector(".song-cover");
    img.dataset.src = `/covers/${song.id}.jpg`;
    img.src = "/placeholder.png";

    node.querySelector(".song-name").textContent = song.name;
    node.querySelector(".song-artist").textContent = song.artist;

    const addBtn = node.querySelector(".song-btn");
    addBtn.addEventListener("click", () => {
      fetch("/api/queue/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: song.id, index: i + 1 })
      });
      loadQueue();
    });

    queueList.appendChild(node);
  });

  observeImages();
}

document.addEventListener("DOMContentLoaded", async () => {
  await loadQueue();
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

async function updateVolume() {
  const res = await fetch("/api/player/volume");
  const { volume } = await res.json();

  setVolIcon(volume);
}

async function keepPageUpdated() {
  await loadQueue();
  await updateCurrSong();
  await updateVolume();
}

setInterval(keepPageUpdated, 500);
