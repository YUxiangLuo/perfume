import fs from "node:fs/promises";
import { find_line_with_string } from "./lib";
import { Hono } from "hono";
import db from "./db";

const res = db.query("select * from albums").all();
console.log(res);

const server = new Hono();


const music_dir = process.env.HOME + "/Music/";
const filenames = await fs.readdir(music_dir);
const filepaths = filenames.map(x => (music_dir + x));

const album_dirs = filepaths.filter(x => !(x.endsWith(".flac") || x.endsWith(".jpg"))).map(x => x + "/");

const albums = await get_albums(album_dirs);




type album = {
    name: string,
    artist: string,
    tracks: string[],
    trackpaths: string[]
}
async function get_albums(dirs: string[]): Promise<album[]> {
    const albums: album[] = [];
    for (const dir of dirs) {
        const tracks = (await fs.readdir(dir)).filter(x => x.endsWith("flac"));
        const trackpaths = tracks.map(x => dir + x);


        let title_line = "";
        let artist_line = "";
        for (const trackpath of trackpaths) {
            export_cover(trackpath, dir);
            const p = Bun.spawn(["ffprobe", `${trackpath}`], {
                stderr: "pipe"
            });
            const reader = p.stderr.values();
            for await (const chunk of reader) {
                const ffprobe_info = new TextDecoder().decode(chunk);
                if (!ffprobe_info.startsWith("ffprobe")) {
                    title_line = title_line ? title_line : find_line_with_string(ffprobe_info, "TITLE");
                    artist_line = artist_line ? artist_line : find_line_with_string(ffprobe_info, "album_artist");
                }
            }
            break;
        }

        const name = title_line.split(":")[1]!.trim();
        const artist = artist_line.split(":")[1]!.trim();

        albums.push({
            name,
            artist,
            tracks: tracks.sort(),
            trackpaths
        })
    }
    return albums;
}

function export_cover(trackpath: string, trackdir: string) {
    let ffmpeg_cmd = `ffmpeg@/-y@/-i@/${trackpath}@/-an@/-vcodec@/copy@/${trackdir}cover1.jpg`;
    Bun.spawn(ffmpeg_cmd.split("@/"), {
        stderr: 'ignore',
        stdout: "ignore"
    });
}

server.get("/albums", (ctx) => {
    return ctx.json(albums);
});

export default server;