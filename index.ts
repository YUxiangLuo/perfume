import fs from "node:fs/promises";
import { find_line_with_string } from "./lib";
import { Hono } from "hono";
import { cors } from "hono/cors";
import db from "./db";
import type { album } from "./types";
const server = new Hono();
server.use("/*", cors());

// await check_music_lib();

let mpv_pid = 0;
server.post("/player/play/:id", async (ctx) => {
  if (mpv_pid) {
    try {
      await Bun.$`kill -9 ${mpv_pid}`;
    } catch (e) {
      // nothing to do
    }
  }
  const id = ctx.req.param("id");
  const db_res: any = db.query("select dir from albums where id = " + id).get();
  const dir = Buffer.from(db_res.dir, "base64").toString("utf8");
  const mpv_process = Bun.spawn(["mpv", dir], {
    stdout: "ignore",
    stderr: "ignore",
  });
  mpv_pid = mpv_process.pid;
  return new Response(id + dir);
});

server.get("/albums", (ctx) => {
  const res: any = db.query("select * from albums order by id desc;").all();
  const albums = res.map((x: any) => ({
    name: Buffer.from(x.name, "base64").toString("utf8"),
    artist: Buffer.from(x.artist, "base64").toString("utf8"),
    id: x.id,
  }));
  return ctx.json(albums);
});

server.post("/albums/update", async (ctx) => {
  await update_music_lib();
  return ctx.text("OK");
});

server.get("/albums/:id", (ctx) => {
  const res: any = db
    .query("select * from albums where id = " + ctx.req.param("id"))
    .get();
  const { id, name, artist, tracks, format } = res;
  return ctx.json({
    id,
    name: Buffer.from(name, "base64").toString("utf8"),
    artist: Buffer.from(artist, "base64").toString("utf8"),
    tracks: Buffer.from(tracks, "base64").toString("utf8"),
    format,
  });
});

server.get("/albums/:id/cover.jpg", async (ctx) => {
  const id = ctx.req.param("id");
  const db_res: any = db
    .query(`select (dir) from albums where id = ${id}`)
    .get();
  let cover_path =
    Buffer.from(db_res.dir, "base64").toString("utf8") + "cover1.jpg";
  if (!(await fs.exists(cover_path))) {
    cover_path = "./cover.jpg";
  }

  const res = new Response(Bun.file(cover_path).stream());
  return res;
});

async function update_music_lib() {
  const music_dir = process.env.HOME + "/Music/";
  const filenames = await fs.readdir(music_dir);
  const filepaths = filenames.map((x) => music_dir + x);

  const album_dirs = filepaths
    .filter((x) => !(x.endsWith(".flac") || x.endsWith(".jpg")))
    .map((x) => x + "/");
  const old_album_dirs = db
    .query("select (dir) from albums;")
    .all()
    .map((x: any) => x.dir)
    .map((x) => Buffer.from(x, "base64").toString("utf8"));
  const old_album_dirs_set = new Set(old_album_dirs);
  const new_album_dirs: string[] = [];
  for (const dir of album_dirs) {
    if (!old_album_dirs_set.has(dir)) {
      new_album_dirs.push(dir);
    }
  }
  await process_album_dirs(new_album_dirs);
}

async function check_music_lib() {
  const music_dir = process.env.HOME + "/Music/";
  const filenames = await fs.readdir(music_dir);
  const filepaths = filenames.map((x) => music_dir + x);

  const album_dirs = filepaths
    .filter((x) => !(x.endsWith(".flac") || x.endsWith(".jpg")))
    .map((x) => x + "/");
  await process_album_dirs(album_dirs);
}

async function process_album_dirs(album_dirs: string[]) {
  const albums: album[] = [];
  for (const dir of album_dirs) {
    const { tracks, trackpaths } = await read_tracks(dir);
    let title_line = "";
    let artist_line = "";
    let audio_line = "";
    for (const trackpath of trackpaths) {
      if (!(await fs.exists(dir + "cover1.jpg"))) export_cover(trackpath, dir);
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
    const name = title_line.split(":")[1]?.trim() || "UNKNOWN";
    const artist = artist_line.split(":")[1]?.trim() || "UNKNOWN";
    console.log(name, artist);

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
  save_albums(albums);
}

export async function read_tracks(dir: string): Promise<{
  tracks: string[];
  trackpaths: string[];
}> {
  let tracks = (await fs.readdir(dir)).filter((x) => !x.endsWith(".jpg"));
  if (tracks[0]?.endsWith(".flac")) {
    tracks = tracks.filter((x) => x.endsWith("flac")).sort();
    return {
      tracks,
      trackpaths: tracks.map((track) => dir + track),
    };
  } else {
    let tracks_: string[] = [];
    let trackpaths_: string[] = [];
    for (const inner_dir of tracks) {
      const { tracks, trackpaths } = await read_tracks(dir + inner_dir + "/");

      tracks_ = [...tracks_, ...tracks];
      trackpaths_ = [...trackpaths_, ...trackpaths];
    }
    return { tracks: tracks_, trackpaths: trackpaths_ };
  }
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
    const insert_album_sql = `insert into albums(name, artist, tracks, dir, trackpaths, is_album, format) values('${Buffer.from(name).toBase64()}', '${Buffer.from(artist).toBase64()}', '${Buffer.from(JSON.stringify(tracks)).toBase64()}', '${Buffer.from(dir).toBase64()}', '${Buffer.from(JSON.stringify(trackpaths)).toBase64()}', ${is_album ? 1 : 0}, '${format}')`;
    db.query(insert_album_sql).run();
  }
}

export default server;
