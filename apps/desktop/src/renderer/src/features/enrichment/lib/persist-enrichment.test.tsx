import { afterEach, expect, it, vi } from "vitest";
import { pool, upsertSave } from "@/features/saves/pool";
import type { Save } from "@/features/saves/types";
import { persistEnrichment } from "./persist-enrichment";
import type { Enricher } from "./types";

const save: Save = {
  id: "persist-enrichment",
  source: "local",
  sourceId: "1",
  url: "",
  title: null,
  description: null,
  author: null,
  notes: null,
  mediaUrl: null,
  mediaType: "image",
  files: [],
  tags: [],
  savedAt: 0,
  createdAt: 0,
  deletedAt: null,
};
const enricher: Enricher = {
  id: "caption",
  enabled: () => true,
  eligible: () => true,
  run: async () => ({
    derived: { caption: "A picture" },
    optimistic: { caption: "A picture" },
  }),
};

afterEach(() => vi.unstubAllGlobals());

it("leaves the save eligible when its derived fields cannot be persisted", async () => {
  upsertSave(save);
  vi.stubGlobal("pond", {
    query: async () => {
      throw new Error("Disk full");
    },
  });
  await expect(persistEnrichment(enricher, save)).rejects.toThrow("Disk full");
  expect(pool.get(save.id)?.caption).toBeUndefined();
});

it("updates the pool after persistence succeeds", async () => {
  upsertSave(save);
  vi.stubGlobal("pond", { query: async () => ({ ok: true }) });
  await persistEnrichment(enricher, save);
  expect(pool.get(save.id)?.caption).toBe("A picture");
});
