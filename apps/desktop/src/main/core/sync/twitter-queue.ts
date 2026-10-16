import { type ConnectedAccount, saves } from "@pond/schema/db";
import type { SyncRunEvent } from "@pond/schema/events";
import { and, eq } from "drizzle-orm";
import { getDb } from "../../db";
import { type EnqueueItem, enqueue } from "../pipeline/enqueue";
import { mergeListKindsOntoExisting } from "../pipeline/list-kinds";
import { createQueueGeneration } from "../pipeline/queue-generations";
import type {
  BookmarksEntry,
  BookmarksHarvestResult,
} from "../refresh/harvest/twitter";
import {
  patchAccountSync,
  persistWatermark,
  type SyncBaseline,
  syncBaselineWhere,
} from "./sync-baseline";
import { emit } from "./sync-status";
import { buildTwitterBookmarkSeed } from "./twitter-seed";
import { planTwitterQueue } from "./twitter-selection";

interface TwitterSyncCompletion {
  account: ConnectedAccount;
  signal: AbortSignal;
  ev: SyncRunEvent;
  baseline: SyncBaseline;
  entries: BookmarksEntry[];
  harvest: {
    complete: boolean;
    gaps: string[];
    failure?: Extract<BookmarksHarvestResult, { ok: false }>;
  };
  maxItems?: number;
}

function seedItem(entry: BookmarksEntry): EnqueueItem {
  const item: EnqueueItem = { url: entry.url };
  const seed = buildTwitterBookmarkSeed(entry);
  if (seed) item.seed = seed;
  if (entry.listKinds) item.listKinds = entry.listKinds;
  return item;
}

export async function finishTwitterSync(
  input: TwitterSyncCompletion,
): Promise<void> {
  const { account, baseline, entries, ev } = input;
  const db = await getDb();
  const failedRows = await db
    .select({ sourceId: saves.sourceId })
    .from(saves)
    .where(and(syncBaselineWhere(account), eq(saves.status, "failed")));
  const failedIds = new Set(failedRows.map((row) => row.sourceId));
  await mergeListKindsOntoExisting(
    "twitter",
    entries.map((entry) => ({
      sourceId: entry.tweetId,
      listKinds: entry.listKinds,
    })),
  );
  const queue = planTwitterQueue({
    entries,
    knownIds: baseline.knownIds,
    failedIds,
    maxItems: input.maxItems,
  });
  const recovery = queue.filter((entry) => failedIds.has(entry.tweetId)).length;
  ev.harvest = {
    seen: entries.length,
    fresh: queue.length - recovery,
    recovery,
  };
  const bulk = await enqueueTwitterQueue(account.id, queue);
  ev.enqueue = { succeeded: bulk.created + bulk.existing, failed: bulk.failed };
  await completeTwitterSync(input, { queue, bulk, failedIds });
}

async function completeTwitterSync(
  input: TwitterSyncCompletion,
  result: {
    queue: BookmarksEntry[];
    bulk: Pick<
      Awaited<ReturnType<typeof enqueue>>,
      "created" | "existing" | "failed"
    >;
    failedIds: ReadonlySet<string>;
  },
): Promise<void> {
  const { account, baseline, entries, ev } = input;
  const { queue, bulk, failedIds } = result;
  if (input.signal.aborted) {
    ev.outcome = "aborted";
    return;
  }
  const uncapped =
    !input.maxItems ||
    entries.filter(
      (entry) =>
        !baseline.knownIds.has(entry.tweetId) || failedIds.has(entry.tweetId),
    ).length <= queue.length;
  const lastSyncedAt = await persistWatermark(account.id, {
    full:
      baseline.full && input.harvest.complete && uncapped && bulk.failed === 0,
    newestId: queue[0]?.tweetId ?? null,
    total: baseline.total + bulk.created,
  });
  if (input.harvest.failure) {
    await reportTwitterFailure(account.id, input.harvest.failure, ev);
    return;
  }
  ev.outcome = bulk.failed > 0 ? "error" : queue.length === 0 ? "noop" : "ok";
  const lastError = bulk.failed > 0 ? "enqueue_failed" : null;
  await patchAccountSync(account.id, { lastError });
  emit({
    accountId: account.id,
    source: "twitter",
    state: bulk.failed > 0 ? "error" : "done",
    message: [
      queue.length === 0
        ? "All caught up."
        : `Queued ${bulk.created + bulk.existing} posts for ingest.`,
      ...input.harvest.gaps,
    ].join(" "),
    lastSyncedAt,
    lastError,
  });
}

async function enqueueTwitterQueue(accountId: string, queue: BookmarksEntry[]) {
  if (queue.length === 0) return { created: 0, existing: 0, failed: 0 };
  emit({
    accountId,
    source: "twitter",
    state: "running",
    message: "Queueing",
    progress: { current: 0, total: queue.length },
  });
  const generationId = await createQueueGeneration({
    kind: "sync",
    source: "twitter",
    scope: { accountId, total: queue.length },
  });
  return enqueue(queue.map(seedItem), {
    trigger: "sync:twitter",
    accountId,
    generationId,
  });
}

export async function reportTwitterFailure(
  accountId: string,
  failure: Extract<BookmarksHarvestResult, { ok: false }>,
  ev: SyncRunEvent,
): Promise<void> {
  const reason = failure.reason;
  await patchAccountSync(accountId, { lastError: reason });
  ev.outcome =
    reason === "auth_required"
      ? "auth_required"
      : reason === "rate_limited"
        ? "rate_limited"
        : "error";
  ev.error = { name: "HarvestError", message: reason };
  emit({
    accountId,
    source: "twitter",
    state:
      reason === "auth_required"
        ? "auth_required"
        : reason === "rate_limited"
          ? "paused"
          : "error",
    message:
      reason === "auth_required"
        ? "Sign in to Twitter to sync your selected lists."
        : reason === "rate_limited"
          ? "Twitter asked us to slow down. Sync is paused."
          : `Couldn't read all selected lists: ${reason}.`,
    lastError: reason,
  });
}
