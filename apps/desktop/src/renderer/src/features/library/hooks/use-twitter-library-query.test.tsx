import {
  DEFAULT_PREFS,
  DEFAULT_SOURCE_SYNC_PREFS,
  type Prefs,
} from "@pond/schema/db";
import { EMPTY_QUERY } from "@pond/schema/filters";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { loadPrefs, savePrefsSection } from "@/shared/state/prefs";
import { useSidebarCounts } from "./use-sidebar-counts";
import { useTwitterLibraryQuery } from "./use-twitter-library-query";

const host = document.createElement("div");
document.body.append(host);
const root = createRoot(host);
afterEach(async () => {
  await act(async () => root.render(null));
  vi.unstubAllGlobals();
});
function Fixture() {
  const query = useTwitterLibraryQuery(EMPTY_QUERY, "library");
  const trash = useTwitterLibraryQuery(EMPTY_QUERY, "trash");
  useSidebarCounts();
  return (
    <div
      data-query={JSON.stringify(query)}
      data-trash={JSON.stringify(trash)}
    />
  );
}
function prefs(lists: ("saved" | "liked")[]): Prefs {
  return {
    ...DEFAULT_PREFS,
    sync: {
      ...DEFAULT_PREFS.sync,
      accounts: {
        alice: {
          id: "alice",
          source: "twitter",
          handle: "alice",
          identityKey: null,
          label: null,
          addedAt: "",
          sync: {
            ...DEFAULT_SOURCE_SYNC_PREFS,
            twitter: { lists, content: "all" },
          },
        },
      },
    },
  };
}

it("requeries library results and counts when selections change, while keeping trash accessible", async () => {
  let current = prefs(["saved", "liked"]);
  const query = vi.fn(async (name: string) => {
    if (name === "settings.getPrefs") return current;
    if (name === "settings.setPrefs") return { ok: true, prefs: current };
    return { library: 0, folders: {} };
  });
  vi.stubGlobal("pond", { query, onSyncAction: () => () => {} });
  await loadPrefs();
  await act(async () => root.render(<Fixture />));
  expect(host.firstElementChild?.getAttribute("data-query")).toBe(
    JSON.stringify(EMPTY_QUERY),
  );
  const before = query.mock.calls.filter(
    ([name]) => name === "saves.sidebarCounts",
  ).length;
  current = prefs(["saved"]);
  await act(async () => savePrefsSection("sync", current.sync));
  expect(host.firstElementChild?.getAttribute("data-query")).toContain(
    '"value":["saved"]',
  );
  expect(host.firstElementChild?.getAttribute("data-trash")).toBe(
    JSON.stringify(EMPTY_QUERY),
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 200));
  });
  expect(
    query.mock.calls.filter(([name]) => name === "saves.sidebarCounts").length,
  ).toBeGreaterThan(before);
  current = prefs(["saved", "liked"]);
  await act(async () => savePrefsSection("sync", current.sync));
  expect(host.firstElementChild?.getAttribute("data-query")).toBe(
    JSON.stringify(EMPTY_QUERY),
  );
});
