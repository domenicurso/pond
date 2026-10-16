import type { TwitterSyncPreferences } from "@pond/schema/db";
import type { BookmarksEntry, RichTweet } from "../refresh/harvest/twitter";

function hasTweetMedia(tweet: RichTweet): boolean {
  return (
    tweet.media.length > 0 ||
    Boolean(tweet.quoted && hasTweetMedia(tweet.quoted))
  );
}

export function selectTwitterEntries(
  entries: BookmarksEntry[],
  selection: TwitterSyncPreferences,
): BookmarksEntry[] {
  if (selection.content === "all") return entries;
  return entries.filter((entry) =>
    entry.rich
      ? hasTweetMedia(entry.rich)
      : Boolean(
          entry.mediaUrl ||
            entry.mediaUrls?.some(
              (media) => media.type === "image" || media.type === "video",
            ),
        ),
  );
}

export function planTwitterQueue(input: {
  entries: BookmarksEntry[];
  knownIds: ReadonlySet<string>;
  failedIds: ReadonlySet<string>;
  maxItems?: number;
}) {
  const fresh = input.entries.filter(
    (entry) =>
      !input.knownIds.has(entry.tweetId) && !input.failedIds.has(entry.tweetId),
  );
  const recovery = input.entries.filter((entry) =>
    input.failedIds.has(entry.tweetId),
  );
  const queue = [...fresh, ...recovery];
  return input.maxItems && input.maxItems > 0
    ? queue.slice(0, input.maxItems)
    : queue;
}
