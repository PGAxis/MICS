# MICS Player

**Multi-Input Central Song Player**  

A web-accessible music player that plays locally stored music on the machine where the app runs.  
It supports playlist and queue management, normal and shuffle playback, repeat functionality, and dynamic playlists (changes in a playlist are reflected immediately in the queue).  

The server now also includes simple queue-based DDoS protection, limiting the number of simultaneous commands being processed.

---

## Features

- Web interface to browse songs, playlists, and queue.
- Dynamic playlist management.
- Queue management: add/remove songs, shuffle, repeat.
- Play/pause/stop/next/previous controls.
- Volume control.
- Local MP3 uploads.
- Simple DDoS protection using a maximum queue limit.

---

## Setup

1. Clone the repository
```bash
git clone https://github.com/PGAxis/MICS.git
cd MICS-Player
```
2. Install dependencies
```bash
npm install
```
3. Create a */songs* folder in the project root and place your MP3 files there:
```bash
mkdir songs
```
4. Run the server (by default, the server runs on [http://localhost:3000](http://localhost:3000).
```bash
npm start
```

---

## REST API Endpoints

<div align="center">

### Songs 🎶

| Method | Endpoint | Description |
|---|---|---|
| GET | **/api/songs** | Returns a list of all songs in the library as objects |
| GET | **/api/songById/:id** | Returns a song object with the given ID |

### Playlists 🎵

| Method | Endpoint | Description |
|---|---|---|
| GET | **/api/playlists** | Returns a list of all playlists |
| GET | **/api/playlist/:name** | Returns a playlists with the specified name, if it exists |
| POST | **/api/playlists** | Gets a name from the body and creates a playlist with that name |
| POST | **/api/playlists/:name/add** | Adds a song (specified by ID from body) into a specific place (specified by index from body) in a playlist (specified by name) |
| POST | **/api/playlists/:name/remove** | Removes a song (specified by ID from body) from a playlist (specified by name) |
| POST | **/api/playlists/remove** | Removes a playlist (specified by name from body) |

### Queue ⬇️

| Method | Endpoint | Description |
|---|---|---|
| GET | **/api/queue** | Returns the full queue |
| POST | **/api/queue/playlist** | Starts playing a playlist (name and shuffle specified from body) |
| POST | **/api/queue/add** | Adds a song (ID in body) into the queue (index can be specified) |
| POST | **/api/queue/remove** | Removes a song (ID and index in body) from the queue |
| POST | **/api/queue/repeat** | Toggles repeat mode for queue |

### Player ⏯️

| Method | Endpoint | Description |
|---|---|---|
| GET | **/api/player/state** | Returns current state of the player (playing, current song, repeat state, position, duration, volume) |
| GET | **/api/player/volume** | Returns just volume |
| POST | **/api/player/play** | Plays a song (ID in body) |
| POST | **/api/player/toggle** | Pauses/Resumes playback based on previous state |
| POST | **/api/player/stop** | Stops playback |
| POST | **/api/player/next** | Skips to the next song |
| POST | **/api/player/prev** | Skips to previous song |
| POST | **/api/player/volume** | Sets the volume |

### Library 📚

| Method | Endpoint | Description |
|---|---|---|
| GET | **/api/library** | Returns current library version |
| POST | **/api/upload** | Uploads given files to the songs folder and changes library version (if no songs are uploaded, it stays the same) |

</div>

### Notes 📓

- This app is designed to work with MP3 files only.
- Editing config or playlists may result in errors -> edit with caution (or don't edit it at all, it is not that important).
- Songs folder must remain accessible.
- For any design changes -> all files are in /public folder
