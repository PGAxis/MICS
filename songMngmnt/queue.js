import * as player from "./playSong.js";
import * as dbHelper from "./databaseSearch.js";

let queue = [];
let oldQueue = [];
let repeatQueue = false;

let history = [];

let playlistPlaying = false;
let useShuffle = false;
let playlistInUse = null;

function getQueue() {
  return queue;
}

function getQueueItem() {
  return { queue, history, repeatQueue, playlistPlaying, useShuffle, playlistInUse };
}

async function apiEnqueue(id, index) {
  oldQueue = [...queue];

  playlistPlaying = false;
  useShuffle = false;
  playlistInUse = null;
  history = [];

  enqueue(id, index);

  if (index === 1) await queueChangedPlay(true);
}

async function apiDequeue(id, index) {
  oldQueue = [...queue];

  playlistPlaying = false;
  useShuffle = false;
  playlistInUse = null;
  history = [];

  if (!index) {
    index = queue.find(s => s.id === id).index;
  }

  dequeue(id, index);

  if (index === 1) await queueChangedPlay(true);
}

async function apiPrev() {
  const state = await player.getState();

  if (state.position > 5.0) {
    await player.setPos(0.0);
    return;
  }

  const lastId = history.pop();
  if (!lastId) return;

  enqueue(lastId, 1);

  if (useShuffle) {
    oldQueue = [...queue];
    dequeue(queue.at(-1)?.id);
  }

  await queueChangedPlay(true);
}

async function apiPlay(id) {
  const song = dbHelper.songByID(id);
  if (!song) return 0;

  const index = 1;

  oldQueue = [...queue];

  if (playlistPlaying) {
    playlistPlaying = false;
    useShuffle = false;
    playlistInUse = null;
    queue = [];
    history = [];
  }

  enqueue(id, index);

  await player.resume();

  await queueChangedPlay(true);

  return 1;
}

async function apiLoadConfig(cfg) {
  oldQueue = [...queue];
  
  queue = cfg.queue;
  history = cfg.history;
  repeatQueue = cfg.repeatQueue;
  playlistPlaying = cfg.playlistPlaying;
  useShuffle = cfg.useShuffle;
  playlistInUse = cfg.playlistInUse;

  await queueChangedPlay(true, true, cfg);

  player.setRepeatState(repeatQueue);
}

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
    const item = queue.find(s => s.id === id);
    if (!item) return;
    index = item.index;
  }

  queue = queue.filter(s => !(s.id === id && s.index === index));
  queue.forEach(song => {
    if (song.index > index) {
      song.index -= 1;
    }
  });
  queue.sort((a, b) => a.index - b.index);
}

function dequeueLast() {
  queue = queue.filter(s => s.index !== queue.length);
}

async function queueChangedPlay(force = false, notify = false, cfg = null) {
  if (queue.length === 0) {
    await player.stop();
    return;
  }

  if (oldQueue.length === 0) {
    const song = dbHelper.songByID(queue[0].id);
    if (!song) return;
    await player.play(song, notify ? cfg.lastPos : null);
    return;
  }

  if (force === true) {
    const song = dbHelper.songByID(queue[0].id);
    if (!song) return;
    await player.play(song, notify ? cfg.lastPos : null);
    return;
  }

  if (oldQueue[0].id !== queue[0].id) {
    const song = dbHelper.songByID(queue[0].id);
    if (!song) return;
    await player.play(song);
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

  await queueChangedPlay(true);
}

async function initPlaylistQueue(playlist, shuffle) {
  playlistPlaying = false;
  useShuffle = false;
  playlistInUse = null;
  history = [];

  //----------

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
    if (!useShuffle) {
      if (newPlaylist.songs.length < playlistInUse.songs.length) {
        playlistInUse = newPlaylist;
  
        oldQueue = [...queue];
        if (!changedSong.index) {
          changedSong.index = queue.find(s => s.id === changedSong.id).index;
        }

        dequeue(changedSong.id);
        if (changedSong.index === 1) await queueChangedPlay();
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
        if (!changedSong.index) {
          changedSong.index = queue.find(s => s.id === changedSong.id).index;
        }

        dequeue(changedSong.id);

        if (Math.ceil(newPlaylist.songs.length / 2) < queue.length) {
          dequeueLast();
        }

        if (changedSong.index === 1) await queueChangedPlay();
      } else {
        if (Math.ceil(newPlaylist.songs.length / 2) > Math.ceil(playlistInUse.songs.length / 2)) {
          playlistInUse = newPlaylist;

          oldQueue = [...queue];

          const newSong = getRandomUnique(playlistInUse.songs, oldQueue);
          if (newSong) {
            enqueue(newSong.id);
          }
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

export {
  getQueue,
  getQueueItem,
  apiEnqueue,
  apiDequeue,
  apiPlay,
  apiPrev,
  apiLoadConfig,
  initPlaylistQueue,
  playlistChanged,
  toggleRepeat,
  autoDequeue,
  queueChangedPlay
}