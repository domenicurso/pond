import type { ListKind } from "@pond/schema/db";
import { expect, it } from "vitest";
import type { BookmarksHarvestResult } from "../refresh/harvest/twitter";
import { readTwitterLists } from "./twitter-lists";

const success: BookmarksHarvestResult = {
  ok: true,
  entries: [{ tweetId: "1", url: "https://x.com/a/status/1" }],
  captures: [],
  reachedEnd: true,
};

it("reads likes independently when bookmarks were not selected", async () => {
  const calls: ListKind[] = [];
  const result = await readTwitterLists({
    selection: { lists: ["liked"], content: "all" },
    signal: new AbortController().signal,
    read: async (kind) => {
      calls.push(kind);
      return success;
    },
  });
  expect(calls).toEqual(["liked"]);
  expect(result.entries[0]?.listKinds).toEqual(["liked"]);
  expect(result.complete).toBe(true);
});

it("continues to likes after a bookmark parsing failure and reports the gap", async () => {
  const result = await readTwitterLists({
    selection: { lists: ["saved", "liked"], content: "all" },
    signal: new AbortController().signal,
    read: async (kind) =>
      kind === "saved" ? { ok: false, reason: "no_match" } : success,
  });
  expect(result.entries[0]?.listKinds).toEqual(["liked"]);
  expect(result.gaps).toHaveLength(1);
  expect(result.complete).toBe(false);
});

it("merges a post appearing in both selected lists without duplication", async () => {
  const result = await readTwitterLists({
    selection: { lists: ["saved", "liked"], content: "all" },
    signal: new AbortController().signal,
    read: async () => success,
  });
  expect(result.entries).toHaveLength(1);
  expect(result.entries[0]?.listKinds).toEqual(
    expect.arrayContaining(["saved", "liked"]),
  );
  expect(result.complete).toBe(true);
});

it.each(["rate_limited", "auth_required"] as const)(
  "stops both timelines after %s",
  async (reason) => {
    const calls: ListKind[] = [];
    const result = await readTwitterLists({
      selection: { lists: ["saved", "liked"], content: "all" },
      signal: new AbortController().signal,
      read: async (kind) => {
        calls.push(kind);
        return { ok: false, reason };
      },
    });
    expect(calls).toEqual(["saved"]);
    expect(result.failure?.reason).toBe(reason);
  },
);

it("does not read another timeline after cancellation", async () => {
  const controller = new AbortController();
  const calls: ListKind[] = [];
  const result = await readTwitterLists({
    selection: { lists: ["saved", "liked"], content: "all" },
    signal: controller.signal,
    read: async (kind) => {
      calls.push(kind);
      controller.abort();
      return success;
    },
  });
  expect(calls).toEqual(["saved"]);
  expect(result.complete).toBe(false);
});
