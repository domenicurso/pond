import type { Save } from "@/features/saves/types";
import type { getPrefsSnapshot } from "@/shared/state/prefs";
import type { Enricher } from "./types";

type PrefsSnapshot = ReturnType<typeof getPrefsSnapshot>;

export function createEnrichmentPreferenceAccess(
  getPrefs: () => PrefsSnapshot,
) {
  return {
    eligible(enricher: Enricher, save: Save, prefs = getPrefs()): boolean {
      return enricher.eligible(save, prefs?.ai);
    },
    run(enricher: Enricher, save: Save) {
      return enricher.run(save, getPrefs()?.ai);
    },
  };
}

function mediaUnderstandingPreferenceKey(prefs: PrefsSnapshot): string {
  const ai = prefs?.ai;
  return ai
    ? `${ai.mediaUnderstandingMode}\u0000${ai.mediaUnderstandingProvider}\u0000${ai.mediaUnderstandingModelId}\u0000${ai.mediaUnderstandingFallbackToFlorence}`
    : "";
}

export function subscribeMediaUnderstandingRefresh(dependencies: {
  getPrefs: () => PrefsSnapshot;
  subscribe: (listener: () => void) => () => void;
  refresh: () => void;
}): () => void {
  let preferenceKey = mediaUnderstandingPreferenceKey(dependencies.getPrefs());
  return dependencies.subscribe(() => {
    const nextKey = mediaUnderstandingPreferenceKey(dependencies.getPrefs());
    if (nextKey === preferenceKey) return;
    preferenceKey = nextKey;
    dependencies.refresh();
  });
}
