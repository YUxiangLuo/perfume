import { test, expect } from "bun:test";
import { read_tracks } from ".";

test("read tracks recursively", async () => {
  const res = await read_tracks(
    "/home/alice/Music/Jace Chan - Processing (2021) [MP4] [16B-44100kHz]/",
  );
  expect(res.tracks.length).toBe(18);
  expect(res.trackpaths.length).toBe(18);
});
