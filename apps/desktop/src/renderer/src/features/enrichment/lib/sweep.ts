import pLimit from "p-limit";
import { enrichmentMonitor } from "@/features/enrichment/state/enrichment-monitor";
import { onPoolDirty, pool } from "@/features/saves/pool";
import type { Save } from "@/features/saves/types";
import { getPrefsSnapshot, subscribePrefsSnapshot } from "@/shared/state/prefs";
import { resetInferenceWorker } from "./inference-client";
import { persistEnrichment } from "./persist-enrichment";
import { ENRICHERS, ENRICHERS_BY_ID } from "./registry";
import {
  createEnrichmentPreferenceAccess,
  subscribeMediaUnderstandingRefresh,
} from "./sweep-preferences";
import {
  cooldown,
  observeEnrichmentRuntime,
  recordRun,
  suspended,
  whenIdle,
} from "./sweep-runtime";
import type { Enricher } from "./types";

export {
  createEnrichmentPreferenceAccess,
  subscribeMediaUnderstandingRefresh,
} from "./sweep-preferences";

const enrichmentPreferenceAccess =
  createEnrichmentPreferenceAccess(getPrefsSnapshot);
const limit = pLimit(1);
const inflight = new Set<string>();
const failed = new Set<string>();
function publishActivity(): void {
  enrichmentMonitor.set({
    inflight: inflight.size,
    activeKeys: new Set(inflight),
    failedKeys: new Set(failed),
  });
}

function keyFor(enricher: Enricher, save: Save): string {
  return `${enricher.id}:${save.id}`;
}

function dependenciesSatisfied(
  enricher: Enricher,
  save: Save,
  prefs: ReturnType<typeof getPrefsSnapshot>,
): boolean {
  if (!enricher.dependsOn) return true;
  for (const depId of enricher.dependsOn) {
    const dep = ENRICHERS_BY_ID.get(depId);
    if (!dep) continue;
    if (
      dep.enabled(prefs) &&
      enrichmentPreferenceAccess.eligible(dep, save, prefs)
    )
      return false;
  }
  return true;
}

function schedule(enricher: Enricher, save: Save): void {
  if (suspended()) return;
  const key = keyFor(enricher, save);
  if (inflight.has(key) || failed.has(key)) return;
  inflight.add(key);
  publishActivity();
  void limit(async () => {
    await whenIdle();
    if (suspended()) {
      inflight.delete(key);
      publishActivity();
      return;
    }
    const startedAt = performance.now();
    let elapsed = 0;
    try {
      await persistEnrichment(enricher, save);
    } catch (err) {
      failed.add(key);
      console.warn(`[enrichment] ${enricher.id} failed for ${save.id}`, err);
    } finally {
      elapsed = performance.now() - startedAt;
      recordRun(enricher, elapsed);
      inflight.delete(key);
      publishActivity();
    }
    if (!failed.has(key)) await cooldown(elapsed);
  });
}

let mutationGeneration = 0;
let lastFullScanGeneration = -1;

function scan(ids?: readonly string[]): void {
  if (suspended()) return;
  const prefs = getPrefsSnapshot();
  const scope = ids && ids.length > 0 ? new Set(ids) : null;
  const saves = [...pool.snapshot()]
    .filter((s) => !scope || scope.has(s.id))
    .sort((a, b) => b.savedAt - a.savedAt);
  const backlog: string[] = [];
  for (const enricher of ENRICHERS) {
    if (!enricher.enabled(prefs)) continue;
    let eligible = 0;
    for (const save of saves) {
      if (!enrichmentPreferenceAccess.eligible(enricher, save, prefs)) continue;
      eligible += 1;
      if (!dependenciesSatisfied(enricher, save, prefs)) continue;
      schedule(enricher, save);
    }
    if (eligible > 0) backlog.push(`${enricher.id}=${eligible}`);
  }
  if (backlog.length > 0) {
    console.info(
      `[enrichment] scan backlog ${backlog.join(" ")} (inflight=${inflight.size})`,
    );
  }
  if (!scope) lastFullScanGeneration = mutationGeneration;
}

let sweepStarted = false;
let scanScheduled = false;
let pendingScope: Set<string> | null = null;
const FULL_SCAN_MS = 15 * 60_000;

function scheduleScan(ids?: readonly string[]): void {
  const scoped = ids && ids.length > 0 ? ids : null;
  if (scanScheduled) {
    if (!scoped) pendingScope = null;
    else if (pendingScope !== null)
      for (const id of scoped) pendingScope.add(id);
    return;
  }
  scanScheduled = true;
  pendingScope = scoped ? new Set(scoped) : null;
  setTimeout(() => {
    void whenIdle().then(() => {
      scanScheduled = false;
      const scope = pendingScope ? [...pendingScope] : undefined;
      pendingScope = null;
      scan(scope);
    });
  }, 250);
}

export function rescanEnrichment(ids?: readonly string[]): void {
  resetInferenceWorker();
  if (ids && ids.length > 0) {
    const scope = new Set(ids);
    for (const key of failed) {
      if (scope.has(key.slice(key.indexOf(":") + 1))) failed.delete(key);
    }
    publishActivity();
    scheduleScan(ids);
    return;
  }
  failed.clear();
  publishActivity();
  scheduleScan();
}

export function startEnrichmentSweep(): () => void {
  if (sweepStarted) return () => {};
  sweepStarted = true;
  const hydrations = ENRICHERS.flatMap((e) =>
    e.hydrate
      ? [
          e.hydrate().catch((err) => {
            console.warn(`[enrichment] hydrate failed (${e.id})`, err);
          }),
        ]
      : [],
  );
  void Promise.all(hydrations).then(() => scheduleScan());
  const detachPrefs = subscribeMediaUnderstandingRefresh({
    getPrefs: getPrefsSnapshot,
    subscribe: subscribePrefsSnapshot,
    refresh: () => rescanEnrichment(),
  });
  const detachDirty = onPoolDirty((ids) => {
    mutationGeneration += 1;
    scheduleScan(ids);
  });
  const fullScanTimer = setInterval(() => {
    if (lastFullScanGeneration !== mutationGeneration) scheduleScan();
  }, FULL_SCAN_MS);

  const detachRuntime = observeEnrichmentRuntime(() => scheduleScan());
  return () => {
    detachDirty();
    detachPrefs();
    clearInterval(fullScanTimer);
    detachRuntime();
    sweepStarted = false;
  };
}
