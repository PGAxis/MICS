import db from "../db/database.js";

function songByID(id) {
  const row = db.prepare("SELECT * FROM songs WHERE id = ?").get(id);

  return row ? row : null;
}

function songIdsByName(query) {
  const rows = db.prepare("SELECT id FROM songs WHERE name LIKE ? OR artist LIKE ? COLLATE NOCASE").all(`%${query}%`, `%${query}%`);

  return rows.map(row => row.id);
}

function songByPath(query) {
  if (!query?.trim()) return null;

  const row = db.prepare("SELECT * FROM songs WHERE path LIKE ? COLLATE NOCASE").get(`%${query}%`);

  return row;
}

export {
  songByID,
  songIdsByName,
  songByPath
};
