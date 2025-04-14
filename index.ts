import fs from "node:fs/promises";
import { find_line_with_string } from "./lib";
import { Hono } from "hono";
import db from "./db";
import type { album } from "./types";
const server = new Hono();

const music_dir = process.env.HOME + "/Music/";
const filenames = await fs.readdir(music_dir);
const filepaths = filenames.map((x) => music_dir + x);

const album_dirs = filepaths
  .filter((x) => !(x.endsWith(".flac") || x.endsWith(".jpg")))
  .map((x) => x + "/");

const albums = await check_music_lib(album_dirs);
save_albums(albums);

server.get("/albums", (ctx) => {
  const res = db.query("select * from albums;").all();
  return ctx.json(res);
});

server.get("/albums/:id/cover.jpg", (ctx) => {
  const id = ctx.req.param("id");
  const db_res: any = db
    .query(`select (dir) from albums where id = ${id}`)
    .get();
  const cover_path =
    Buffer.from(db_res.dir, "base64").toString("utf8") + "cover1.jpg";
  const res = new Response(Bun.file(cover_path).stream());
  return res;
});

async function check_music_lib(dirs: string[]): Promise<album[]> {
  const albums: album[] = [];
  for (const dir of dirs) {
    const tracks = (await fs.readdir(dir))
      .filter((x) => x.endsWith("flac"))
      .sort();
    const trackpaths = tracks.map((x) => dir + x);

    let title_line = "";
    let artist_line = "";
    let audio_line = "";
    for (const trackpath of trackpaths) {
      export_cover(trackpath, dir);
      const p = Bun.spawn(["ffprobe", `${trackpath}`], {
        stderr: "pipe",
      });
      const reader = p.stderr.values();
      for await (const chunk of reader) {
        const ffprobe_info = new TextDecoder().decode(chunk);
        if (!ffprobe_info.startsWith("ffprobe")) {
          title_line = title_line
            ? title_line
            : find_line_with_string(ffprobe_info, "TITLE");
          artist_line = artist_line
            ? artist_line
            : find_line_with_string(ffprobe_info, "ARTIST");
          audio_line = audio_line
            ? audio_line
            : find_line_with_string(ffprobe_info, "Audio: ");
        }
      }
      break;
    }
    const name = title_line.split(":")[1]!.trim();
    const artist = artist_line.split(":")[1]!.trim();

    const is_album = dir.includes(name) || dir.includes(artist);
    const format = audio_line.substring(audio_line.lastIndexOf(":") + 2);
    const album = {
      name,
      artist,
      tracks,
      dir,
      is_album,
      trackpaths,
      format,
    };
    albums.push(album);
  }
  return albums;
}

function export_cover(trackpath: string, trackdir: string) {
  let ffmpeg_cmd = `ffmpeg@/-y@/-i@/${trackpath}@/-an@/-vcodec@/copy@/${trackdir}cover1.jpg`;
  Bun.spawn(ffmpeg_cmd.split("@/"), {
    stderr: "ignore",
    stdout: "ignore",
  });
}

function save_albums(albums: album[]) {
  for (const album of albums) {
    const { name, artist, tracks, dir, trackpaths, is_album, format } = album;
    const insert_album_sql = `insert into albums(name, artist, tracks, dir, trackpaths, is_album, format) values('${Buffer.from(JSON.stringify(name)).toBase64()}', '${Buffer.from(JSON.stringify(artist)).toBase64()}', '${Buffer.from(JSON.stringify(tracks)).toBase64()}', '${Buffer.from(dir).toBase64()}', '${Buffer.from(JSON.stringify(trackpaths)).toBase64()}', ${is_album ? 1 : 0}, '${format}')`;
    db.query(insert_album_sql).run();
  }
}

export default server;
