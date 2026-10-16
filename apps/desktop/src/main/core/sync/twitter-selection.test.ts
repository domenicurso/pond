import { expect, it } from "vitest";
import { twitterSyncPreferences } from "../../../shared/twitter-sync";
import type { BookmarksEntry, RichTweet } from "../refresh/harvest/twitter";
import { planTwitterQueue, selectTwitterEntries } from "./twitter-selection";

function entry(tweetId: string): BookmarksEntry {
  return { tweetId, url: `https://x.com/a/status/${tweetId}` };
}
function rich(media: RichTweet["media"]): RichTweet {
  return {
    tweetId: "1",
    url: "https://x.com/a/status/1",
    fullText: "hello",
    author: { handle: "a", name: "A" },
    media,
    metrics: { likes: 0, retweets: 0, replies: 0 },
    raw: {},
  };
}

it("preserves both lists and all posts for existing accounts", () => {
  expect(twitterSyncPreferences(undefined)).toEqual({
    lists: ["saved", "liked"],
    content: "all",
  });
  expect(() => twitterSyncPreferences({ lists: [], content: "all" })).toThrow();
});

it("includes photos, videos and quoted media while excluding text and link cards", () => {
  const text = entry("text");
  const image = {
    ...entry("image"),
    mediaUrls: [
      { url: "https://pbs.twimg.com/image.jpg", type: "image" as const },
    ],
  };
  const video = {
    ...entry("video"),
    rich: rich([{ type: "video", url: "https://video.twimg.com/video.mp4" }]),
  };
  const quoted = {
    ...entry("quote"),
    rich: {
      ...rich([]),
      quoted: rich([{ type: "image", url: "https://pbs.twimg.com/image.jpg" }]),
    },
  };
  const link = {
    ...entry("link"),
    rich: {
      ...rich([]),
      card: { imageUrl: "https://example.com/preview.jpg" },
    },
  };
  const entries = [text, image, video, quoted, link];
  expect(
    selectTwitterEntries(entries, { lists: ["liked"], content: "media" }),
  ).toEqual([image, video, quoted]);
  expect(
    selectTwitterEntries(entries, { lists: ["saved"], content: "all" }),
  ).toEqual(entries);
});

it("queues more than three posts and recovers a failed post exactly once", () => {
  const entries = Array.from({ length: 12 }, (_, index) =>
    entry(String(index)),
  );
  const input = {
    entries,
    knownIds: new Set(["0", "1"]),
    failedIds: new Set(["1", "2"]),
  };
  const queue = planTwitterQueue(input);
  expect(queue).toHaveLength(11);
  expect(new Set(queue.map((post) => post.tweetId)).size).toBe(11);
  expect(queue.some((post) => post.tweetId === "0")).toBe(false);
  expect(planTwitterQueue({ ...input, maxItems: 8 })).toHaveLength(8);
});
