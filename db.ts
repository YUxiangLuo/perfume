import Database from "bun:sqlite"
const db = new Database("./sqlite.db");
db.query("create table if not exists albums(name TEXT, artist TEXT, tracks TEXT, trackpaths TEXT)").run();

export default db;