import { expect, it } from "vitest";
import type { RichTweet } from "../refresh/harvest/twitter";
import { buildTwitterBookmarkSeed } from "./twitter-seed";

it("classifies a text post quoting a video as video media", () => {
  const quoted: RichTweet = {
    tweetId: "2",
    url: "https://x.com/b/status/2",
    fullText: "A video",
    author: { handle: "b", name: "B" },
    media: [
      {
        type: "video",
        url: "https://video.twimg.com/clip.mp4",
        poster: "https://pbs.twimg.com/poster.jpg",
      },
    ],
    metrics: { likes: 0, retweets: 0, replies: 0 },
    raw: {},
  };
  const rich: RichTweet = {
    ...quoted,
    tweetId: "1",
    url: "https://x.com/a/status/1",
    media: [],
    quoted,
  };
  const seed = buildTwitterBookmarkSeed({ tweetId: "1", url: rich.url, rich });
  expect(seed?.mediaType).toBe("video");
  expect(seed?.mediaUrl).toBe("https://video.twimg.com/clip.mp4");
  expect(seed?.rawJson.capture?.quoted?.media[0]?.type).toBe("video");
});
