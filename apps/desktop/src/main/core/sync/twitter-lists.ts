import type { ListKind, TwitterSyncPreferences } from "@pond/schema/db";
import type {
  BookmarksEntry,
  BookmarksHarvestResult,
} from "../refresh/harvest/twitter";
import { mergeEntryListKinds, stampListKind, unionById } from "./harvest-union";
import { listGapNote } from "./sync-status";

type HarvestFailure = Extract<BookmarksHarvestResult, { ok: false }>;
type ListReader = (kind: ListKind) => Promise<BookmarksHarvestResult>;

export async function readTwitterLists(input: {
  selection: TwitterSyncPreferences;
  read: ListReader;
  signal: AbortSignal;
}): Promise<{
  entries: BookmarksEntry[];
  gaps: string[];
  complete: boolean;
  failure?: HarvestFailure;
}> {
  let entries: BookmarksEntry[] = [];
  const gaps: string[] = [];
  let failure: HarvestFailure | undefined;
  let completedLists = 0;
  for (const kind of new Set(input.selection.lists)) {
    if (input.signal.aborted) break;
    const result = await input.read(kind);
    if (result.ok) {
      entries = unionById(
        entries,
        stampListKind(result.entries, kind),
        (entry) => entry.tweetId,
        mergeEntryListKinds,
      );
      completedLists += Number(result.reachedEnd);
      continue;
    }
    failure = result;
    gaps.push(
      listGapNote(kind === "saved" ? "Bookmarks" : "Likes", result.reason),
    );
    // Both timelines share the session and rate budget; never continue after a safety stop.
    if (result.reason === "rate_limited" || result.reason === "auth_required")
      break;
  }
  return {
    entries,
    gaps,
    complete: completedLists === new Set(input.selection.lists).size,
    failure,
  };
}
