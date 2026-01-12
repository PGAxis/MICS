import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database(path.join(__dirname, "music.db"));

db.pragma("foreign_keys = ON");

db.prepare(`
    CREATE TABLE IF NOT EXISTS songs (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        artist TEXT,
        duration INTEGER,
        path TEXT NOT NULL UNIQUE
    )
`).run();

export default db;