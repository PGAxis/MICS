import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parseFile } from "music-metadata";
import db from "../db/database.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MUSIC_FOLDER = path.join(__dirname, "../songs");
const COVER_FOLDER = path.join(__dirname, "../covers");
const PLACEHOLDER = path.join(COVER_FOLDER, "placeholder.png");

if (!fs.existsSync(COVER_FOLDER)) {
    fs.mkdirSync(COVER_FOLDER);
}

function scanFolder(folder) {
    let files = [];
    const entries = fs.readdirSync(folder, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(folder, entry.name);
        if (entry.isDirectory()) {
            files = files.concat(scanFolder(fullPath));
        } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".mp3")) {
            files.push(fullPath);
        }
    }
    return files;
}

function saveCover(id, picture) {
    const filePath = path.join(COVER_FOLDER, `${id}.jpg`);

    if (fs.existsSync(filePath)) return;

    if (picture) {
        fs.writeFileSync(filePath, picture.data);
        console.log(`Saved cover for ID ${id}`);
    } else {
        if (fs.existsSync(PLACEHOLDER)) {
            fs.copyFileSync(PLACEHOLDER, filePath);
            console.log(`No cover provided, using placeholder for ID ${id}`);
        } else {
            console.warn(`Placeholder not found at ${PLACEHOLDER}`);
        }
    }
}

function removeSongs(files, dbSongs) {
    const fileSet = new Set(files.map(p => path.normalize(p)));

    const deleteStmt = db.prepare("DELETE FROM songs WHERE id = ?");

    let removed = 0

    const tx = db.transaction(() => {

        for (const song of dbSongs) {
            const songPath = path.normalize(song.path);
    
            if (!fileSet.has(songPath)) {
                deleteStmt.run(song.id);
                fs.rmSync(path.join(COVER_FOLDER, `${song.id}.jpg`));
                removed++;
            }
        }
    });

    tx();

    return removed;
}

async function scanSongs() {
    const files = scanFolder(MUSIC_FOLDER);

    const allSongs = db.prepare("SELECT id, path FROM songs").all();

    const removed = removeSongs(files, allSongs);
    let added = 0;

    const findByPath = db.prepare("SELECT id FROM songs WHERE path = ?");

    for (const filePath of files) {
        const existing = findByPath.get(filePath);
        if (existing) {
            const coverPath = path.join(COVER_FOLDER, `${existing.id}.jpg`);
            if (!fs.existsSync(coverPath)) {
                try {
                    const metadata = await parseFile(filePath);
                    const picture = metadata.common.picture?.[0];
                    saveCover(existing.id, picture);
                } catch (err) {
                    console.error(`Failed to read cover for ${filePath}: ${err.message}`);
                }
            }
            continue;
        }

        try {
            const metadata = await parseFile(filePath);

            const title = metadata.common.title || path.basename(filePath, ".mp3");
            const artist = metadata.common.artist || "Unknown";
            const duration = Math.round(metadata.format.duration || 0);

            const result = db.prepare(`
                INSERT INTO songs (name, artist, duration, path)
                VALUES (?, ?, ?, ?)
            `).run(title, artist, duration, filePath);

            const songId = result.lastInsertRowid;

            const picture = metadata.common.picture?.[0];
            saveCover(songId, picture);

            console.log(`Added: ${title} by ${artist}`);

            added++;
        } catch (err) {
            console.error(`Failed to read ${filePath}:`, err.message);
        }
    }

    console.log(`Scan complete! ${added} songs added, ${removed} songs removed.`);
}

export { scanSongs };
