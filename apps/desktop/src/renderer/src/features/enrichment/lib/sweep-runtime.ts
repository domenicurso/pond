import type { Enricher } from "./types";

declare global {
  interface Navigator {
    getBattery?(): Promise<EventTarget & { charging: boolean }>;
  }
}

/** Inference runs on the UI renderer; pause while hidden so it never burns CPU/GPU invisibly. */
let hidden = false;

export function suspended(): boolean {
  return hidden;
}

const stats = {
  done: 0,
  totalMs: 0,
  byEnricher: new Map<string, { done: number; ms: number }>(),
};

export function recordRun(enricher: Enricher, ms: number): void {
  stats.done += 1;
  stats.totalMs += ms;
  const e = stats.byEnricher.get(enricher.id) ?? { done: 0, ms: 0 };
  e.done += 1;
  e.ms += ms;
  stats.byEnricher.set(enricher.id, e);
  if (stats.done % 10 === 0) {
    const avg = Math.round(stats.totalMs / stats.done);
    console.info(
      `[enrichment] progress done=${stats.done} avg=${avg}ms ` +
        `last=${enricher.id} (${Math.round(ms)}ms)`,
    );
  }
}

/**
 * Rest between runs so the CPU/GPU returns to idle instead of pinning at ~100% for the whole backlog; requestIdleCallback fires immediately on an idle machine, so heavy runs would otherwise go back-to-back.
 * @remarks Rest is ~50% of the run's own duration, clamped so quick runs still pause and long runs don't stall the backlog; pLimit(1) puts the gap between runs.
 */
const COOLDOWN_MIN_MS = 400;
const COOLDOWN_MAX_MS = 3000;
let onBattery = false;
const ON_BATTERY_COOLDOWN_FACTOR = 2.5;
export function cooldown(lastRunMs: number): Promise<void> {
  if (suspended()) return Promise.resolve();
  const factor = onBattery ? ON_BATTERY_COOLDOWN_FACTOR : 1;
  const ms = Math.min(
    COOLDOWN_MAX_MS * factor,
    Math.max(COOLDOWN_MIN_MS * factor, lastRunMs * 0.5 * factor),
  );
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function whenIdle(timeout = 2000): Promise<void> {
  return new Promise((resolve) => {
    if (globalThis.requestIdleCallback) {
      globalThis.requestIdleCallback(() => resolve(), { timeout });
    } else setTimeout(resolve, 0);
  });
}

export function observeEnrichmentRuntime(onResume: () => void): () => void {
  let detachVisibility = (): void => {};
  if (globalThis.document) {
    hidden = document.hidden;
    const onVisibility = (): void => {
      hidden = document.hidden;
      if (!hidden) onResume();
    };
    document.addEventListener("visibilitychange", onVisibility);
    detachVisibility = () =>
      document.removeEventListener("visibilitychange", onVisibility);
  }

  let detachBattery = (): void => {};
  const { getBattery } = navigator;
  if (getBattery) {
    void getBattery
      .call(navigator)
      .then((battery) => {
        const sync = (): void => {
          onBattery = !battery.charging;
        };
        sync();
        battery.addEventListener("chargingchange", sync);
        detachBattery = () =>
          battery.removeEventListener("chargingchange", sync);
      })
      .catch(() => {});
  }

  return () => {
    detachVisibility();
    detachBattery();
  };
}
