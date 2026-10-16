import { DEFAULT_PREFS, DEFAULT_SOURCE_SYNC_PREFS } from "@pond/schema/db";
import type { MenuItemSpec } from "@pond/ui";
import { afterEach, expect, it, vi } from "vitest";
import { loadPrefs } from "@/shared/state/prefs";
import type { SourceMenuTarget } from "./source-menu-target";
import { twitterSyncMenu } from "./twitter-sync-menu";

function target(): SourceMenuTarget {
  return {
    id: "twitter",
    type: "account",
    source: "twitter",
    handle: "alice",
    label: null,
    model: {
      tone: "ok",
      statusText: "Active",
      meta: "",
      connected: true,
      lastText: "",
    },
    knownCount: 20,
    lastError: null,
  };
}
function checkbox(items: MenuItemSpec[], label: string) {
  for (const item of items) {
    if (item.type === "checkbox" && item.label === label) return item;
    if (item.type === "submenu") {
      const child = item.items.find(
        (candidate) =>
          candidate.type === "checkbox" && candidate.label === label,
      );
      if (child?.type === "checkbox") return child;
    }
  }
  throw new Error(`Missing checkbox: ${label}`);
}

afterEach(() => vi.unstubAllGlobals());

it("offers independent lists and a media filter only for Twitter accounts", () => {
  const items = twitterSyncMenu(target(), {});
  expect(checkbox(items, "Bookmarks").checked).toBe(true);
  expect(checkbox(items, "Likes").checked).toBe(true);
  expect(checkbox(items, "All Posts").checked).toBe(true);
  expect(checkbox(items, "Posts with Media").checked).toBe(false);
  expect(twitterSyncMenu({ ...target(), type: "watch" }, {})).toEqual([]);
  expect(twitterSyncMenu({ ...target(), source: "instagram" }, {})).toEqual([]);
});

it("prevents deselecting the last list and changing options during sync", () => {
  const selected = {
    ...target(),
    twitterSync: { lists: ["liked" as const], content: "media" as const },
  };
  expect(checkbox(twitterSyncMenu(selected, {}), "Likes").disabled).toBe(true);
  expect(checkbox(twitterSyncMenu(selected, {}), "Bookmarks").disabled).toBe(
    false,
  );
  expect(
    twitterSyncMenu(
      { ...target(), model: { ...target().model, tone: "run" } },
      {},
    )[0],
  ).toMatchObject({ disabled: true });
});

it("persists the selection and schedules a full scan without dropping account state", async () => {
  const account = {
    id: "twitter",
    source: "twitter" as const,
    handle: "alice",
    identityKey: "42",
    label: null,
    addedAt: "",
    sync: {
      ...DEFAULT_SOURCE_SYNC_PREFS,
      knownCount: 20,
      lastFullSyncAt: "2026-10-01",
    },
  };
  const prefs = {
    ...DEFAULT_PREFS,
    sync: { ...DEFAULT_PREFS.sync, accounts: { twitter: account } },
  };
  const query = vi.fn(async (name: string) =>
    name === "settings.getPrefs" ? prefs : { ok: true, prefs },
  );
  vi.stubGlobal("pond", { query });
  await loadPrefs();
  const changed = vi.fn();
  checkbox(
    twitterSyncMenu(target(), { onChanged: changed }),
    "Posts with Media",
  ).onCheckedChange?.(true);
  await vi.waitFor(() => expect(changed).toHaveBeenCalled());
  expect(query).toHaveBeenCalledWith("settings.setPrefs", {
    sync: {
      accounts: {
        twitter: {
          ...account,
          sync: {
            ...account.sync,
            twitter: { lists: ["saved", "liked"], content: "media" },
            lastFullSyncAt: null,
          },
        },
      },
    },
  });
});
