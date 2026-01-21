import MPV from "node-mpv";

const player = new MPV({audio_only: true, auto_restart: false});
let currentSong = null;
let isRepeating = false;

let wasPlaying = false;
const endListeners = new Set();

async function start() {
  await player.load();
}

async function play(song, pos = 0) {
  await stop();
  currentSong = song;

  await player.load(song.path);

  if (pos > 0) {
    await waitUntilReady(player);
    await player.setProperty("pause", true);
    await player.setProperty("time-pos", pos);
    await player.setProperty("pause", false);
  }
}

async function pause() {
  await player.pause();
}

async function resume() {
  await player.resume();
}

async function stop() {
  await player.stop();
  currentSong = null;
}

async function getVolume() {
  return await player.getProperty("volume");
}

async function setVolume(vol) {
  await player.setProperty("volume", Math.max(0, Math.min(100, vol)));
}

async function getState() {
  if (!currentSong) return { isPlaying: false, currentSong: null, isRepeating, position: 0, duration: 0, volume: await player.getProperty("volume") || 0 };

  const isPlaying = await player.getProperty("pause").then(p => !p);
  const position = await player.getProperty("time-pos");
  const duration = await player.getProperty("duration");
  const volume = await player.getProperty("volume");

  return {
    isPlaying,
    currentSong,
    isRepeating,
    position: position || 0,
    duration: duration || 0,
    volume: volume || 0
  };
}

async function setPos(sec) {
  const duration = await player.getProperty("duration");
  if (!duration) return;

  const pos = Math.max(0, Math.min(sec, duration));
  await player.setProperty("time-pos", pos);
}

function onSongEnd(cb) {
  endListeners.add(cb);
  return () => endListeners.delete(cb);
}

function setRepeatState(repeat) {
  if (repeat) {
    isRepeating = true;
  } else {
    isRepeating = false;
  }
  return;
}

async function quit() {
  try {
    await player.stop();
    await player.quit();
  } catch (_) {}

  if (player.mpvProcess && !player.mpvProcess.killed) {
    player.mpvProcess.kill();
  }
}

async function waitUntilReady(player) {
  while (true) {
    try {
      const duration = await player.getProperty("duration");
      if (typeof duration === "number" && duration > 0) return;
    } catch {}
    await new Promise(r => setTimeout(r, 30));
  }
}

setInterval(async () => {
  if (!currentSong) return;

  const idle = await player.getProperty("idle-active");

  if (!idle && !wasPlaying) {
    wasPlaying = true;
  }

  if (idle && wasPlaying) {
    wasPlaying = false;
    currentSong = null;
    notifySongEnded();
  }
}, 250);

function notifySongEnded() {
  for (const cb of endListeners) cb();
}

export {
  start,
  play,
  pause,
  resume,
  stop,
  getVolume,
  setVolume,
  getState,
  onSongEnd,
  setRepeatState,
  setPos,
  quit
};
