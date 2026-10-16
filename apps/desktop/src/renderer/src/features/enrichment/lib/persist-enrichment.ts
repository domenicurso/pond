import { pool, upsertSave } from "@/features/saves/pool";
import type { Save } from "@/features/saves/types";
import { getPrefsSnapshot } from "@/shared/state/prefs";
import { createEnrichmentPreferenceAccess } from "./sweep-preferences";
import type { Enricher } from "./types";

const preferences = createEnrichmentPreferenceAccess(getPrefsSnapshot);
export async function persistEnrichment(
  enricher: Enricher,
  save: Save,
): Promise<void> {
  const result = await preferences.run(enricher, save);
  if (result == null) {
    throw new Error(`No result from ${enricher.id}`);
  }
  if (result.derived && Object.keys(result.derived).length > 0) {
    await window.pond.query("saves.patchDerived", {
      id: save.id,
      patch: result.derived,
    });
  }
  if (result.optimistic) {
    const current = pool.get(save.id);
    if (current) upsertSave({ ...current, ...result.optimistic });
  }
}
