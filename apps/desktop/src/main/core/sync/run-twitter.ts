import type { ConnectedAccount, ListKind } from "@pond/schema/db";
import type { SyncRunEvent } from "@pond/schema/events";
import { twitterSyncPreferences } from "../../../shared/twitter-sync";
import {
  harvestTwitterBookmarks,
  harvestTwitterLikes,
} from "../refresh/harvest-window";
import { partitionForAccount } from "./accounts";
import { loadSyncBaseline, patchAccountSync } from "./sync-baseline";
import { emit } from "./sync-status";
import { readTwitterLists } from "./twitter-lists";
import { finishTwitterSync, reportTwitterFailure } from "./twitter-queue";
import { selectTwitterEntries } from "./twitter-selection";

function timelineReader(account: ConnectedAccount, knownIds: string[]) {
  const partition = partitionForAccount(account.id);
  return (kind: ListKind) => {
    const onProgress = () =>
      emit({
        accountId: account.id,
        source: "twitter",
        state: "running",
        message: kind === "saved" ? "Reading bookmarks" : "Reading likes",
      });
    return kind === "saved"
      ? harvestTwitterBookmarks({ knownIds }, { partition, onProgress })
      : harvestTwitterLikes(
          { knownIds },
          { partition, onProgress, handle: account.handle ?? "" },
        );
  };
}

// Keep the existing positional contract shared by the Source sync runners.
export async function syncTwitter(
  account: ConnectedAccount,
  signal: AbortSignal,
  ev: SyncRunEvent,
  maxItems?: number,
  forceFull = false,
): Promise<void> {
  const selection = twitterSyncPreferences(account.sync.twitter);
  const baseline = await loadSyncBaseline(account, forceFull);
  await patchAccountSync(account.id, { knownCount: baseline.total });
  emit({
    accountId: account.id,
    source: "twitter",
    state: "running",
    message: "Reading",
  });
  const harvest = await readTwitterLists({
    selection,
    signal,
    read: timelineReader(account, baseline.full ? [] : [...baseline.knownIds]),
  });
  if (signal.aborted) {
    ev.outcome = "aborted";
    return;
  }
  if (harvest.failure && harvest.entries.length === 0) {
    await reportTwitterFailure(account.id, harvest.failure, ev);
    return;
  }
  await finishTwitterSync({
    account,
    signal,
    ev,
    baseline,
    entries: selectTwitterEntries(harvest.entries, selection),
    harvest,
    maxItems,
  });
}
