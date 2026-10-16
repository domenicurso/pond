import { expect, it } from "vitest";
import type { Save, SaveFile } from "@/features/saves/types";
import { pickCardUnit, pickPrimaryUnit } from "./units";

function file(kind: string, path: string, mimeType: string): SaveFile {
  return { kind, path, mimeType, sha256: "test", size: 10 };
}
function save(files: SaveFile[]): Save {
  return {
    id: "video",
    source: "twitter",
    sourceId: "1",
    url: "https://x.com/a/status/1",
    title: null,
    description: null,
    author: null,
    notes: null,
    mediaUrl: null,
    mediaType: "video",
    files,
    tags: [],
    savedAt: 0,
    createdAt: 0,
    deletedAt: null,
  };
}

it("fills the card with downloaded video even when tweet screenshots are selected", () => {
  const target = save([
    file("tweet_screenshot_light", "tweet-light.png", "image/png"),
    file("thumbnail", "thumbnail.png", "image/png"),
    file("video", "clip.mp4", "video/mp4"),
    file("poster", "poster.jpg", "image/jpeg"),
  ]);
  const options = {
    tweetCover: "screenshot" as const,
    theme: "light" as const,
  };
  expect(pickCardUnit(target, options)).toMatchObject({
    key: "clip.mp4",
    isVideo: true,
    posterKey: "poster.jpg",
  });
  expect(pickPrimaryUnit(target, options)?.key).toBe("clip.mp4");
});

it("keeps tweet screenshots as a fallback until video is downloaded", () => {
  const target = save([
    file("tweet_screenshot_light", "tweet-light.png", "image/png"),
  ]);
  expect(
    pickCardUnit(target, { tweetCover: "screenshot", theme: "light" })?.key,
  ).toBe("tweet-light.png");
});
