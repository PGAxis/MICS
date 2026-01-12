import MPV from "node-mpv";

const player = new MPV({audio_only: true, auto_restart: true});
let currentSong = null;
let isRepeating = false;

let wasPlaying = false;
const endListeners = new Set();

async function play(song) {
    await stop();
    currentSong = song;
    await player.load(song.path);
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

async function getState() {
  if (!currentSong) return { isPlaying: false, currentSong: null, position: 0, duration: 0 };

  const isPlaying = await player.getProperty("pause").then(p => !p);
  const position = await player.getProperty("time-pos");
  const duration = await player.getProperty("duration");

  return {
    isPlaying,
    currentSong,
    isRepeating,
    position: position || 0,
    duration: duration || 0
  };
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
    play,
    pause,
    resume,
    stop,
    getState,
    onSongEnd,
    setRepeatState
};
