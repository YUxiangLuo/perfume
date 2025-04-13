import fs from "node:fs/promises";
const music_dir = process.env.HOME + "/Music/";
const filenames = await fs.readdir(music_dir);

const album_dirs = filenames.filter(async (x) => (await (fs.stat(music_dir+x))).isDirectory()).map(x => (music_dir+x));
console.log(album_dirs, album_dirs.length);