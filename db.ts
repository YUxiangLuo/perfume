import Database from "bun:sqlite";
// await Bun.$`rm -rf ./sqlite.db`;
await Bun.$`sync`;
const db = new Database("./sqlite.db");
db.query(
  "create table if not exists albums(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, artist TEXT, tracks TEXT, dir TEXT, trackpaths TEXT,  is_album NUM, format TEXT)",
).run();
export default db;
