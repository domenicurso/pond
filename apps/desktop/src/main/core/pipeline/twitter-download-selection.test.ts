import * as schema from "@pond/schema/db";
import * as events from "@pond/schema/events";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { afterEach, expect, it, vi } from "vitest";
import { initializePondSchema } from "../../db";
import { cancelExcludedTwitterDownloads } from "./twitter-download-selection";

const opened: Database.Database[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});
function account(
  selection: schema.TwitterSyncPreferences,
): schema.ConnectedAccount {
  return {
    id: "alice",
    source: "twitter",
    handle: "alice",
    identityKey: null,
    label: null,
    addedAt: "",
    sync: { ...schema.DEFAULT_SOURCE_SYNC_PREFS, twitter: selection },
  };
}
const seed = (media: unknown[], quoted?: { media: unknown[] }) =>
  JSON.stringify({ capture: { media, quoted } });
const posts = [
  [
    "liked",
    "alice",
    '["liked"]',
    "ingesting",
    "image",
    seed([{ type: "image" }]),
  ],
  [
    "saved",
    "alice",
    '["saved"]',
    "ingesting",
    "image",
    seed([{ type: "image" }]),
  ],
  [
    "both",
    "alice",
    '["saved","liked"]',
    "ingesting",
    "video",
    seed([{ type: "video" }]),
  ],
  ["card", "alice", '["saved"]', "ingesting", "image", seed([])],
  [
    "quoted",
    "alice",
    '["saved"]',
    "ingesting",
    "text",
    seed([], { media: [{ type: "video" }] }),
  ],
  ["fallback", "alice", '["saved"]', "ingesting", "video", null],
  ["other", "bob", '["liked"]', "ingesting", "text", seed([])],
  [
    "complete",
    "alice",
    '["liked"]',
    "complete",
    "image",
    seed([{ type: "image" }]),
  ],
  ["manual", null, "[]", "ingesting", "text", seed([])],
  ["unknown", "alice", '["saved"]', "ingesting", null, null],
];

function setup() {
  const sqlite = new Database(":memory:");
  opened.push(sqlite);
  initializePondSchema(sqlite, () => false);
  const db = Object.assign(
    drizzle(sqlite, { schema: { ...schema, ...events } }),
    { $raw: sqlite },
  );
  const insert =
    sqlite.prepare(`insert into saves(id,source,source_id,url,saved_at,created_at,status,account_id,list_kinds,media_type,raw_json)
    values (?, 'twitter', ?, 'https://x.com/post', 1, 1, ?, ?, ?, ?, ?)`);
  for (const [id, owner, lists, status, type, raw] of posts)
    insert.run(id, id, status, owner, lists, type, raw);
  return { db, sqlite };
}

it("cancels excluded lists and non-media jobs, preserving quoted media and completed archives", async () => {
  const { db, sqlite } = setup();
  const cancel = vi.fn(async (_id: string) => true);
  const cancelled = await cancelExcludedTwitterDownloads({
    db,
    accounts: {
      alice: account({ lists: ["saved"], content: "media" }),
    },
    cancel,
  });
  expect(cancelled).toBe(2);
  expect(cancel.mock.calls.map(([id]) => id).sort()).toEqual(["card", "liked"]);
  expect(sqlite.prepare("select count(*) as n from saves").get()).toEqual({
    n: 10,
  });
});

it("keeps text jobs for all-post sync and leaves jobs alone when both lists are enabled", async () => {
  const { db } = setup();
  const cancel = vi.fn(async (_id: string) => true);
  await cancelExcludedTwitterDownloads({
    db,
    accounts: {
      alice: account({ lists: ["saved"], content: "all" }),
    },
    cancel,
  });
  expect(cancel.mock.calls.map(([id]) => id)).toEqual(["liked"]);
  cancel.mockClear();
  await cancelExcludedTwitterDownloads({
    db,
    accounts: {
      alice: account({ lists: ["saved", "liked"], content: "all" }),
    },
    cancel,
  });
  expect(cancel).not.toHaveBeenCalled();
});

it("propagates cancellation failures instead of claiming that pending work was removed", async () => {
  const { db } = setup();
  const error = new Error("Queue write failed");
  await expect(
    cancelExcludedTwitterDownloads({
      db,
      accounts: {
        alice: account({ lists: ["saved"], content: "all" }),
      },
      cancel: async () => {
        throw error;
      },
    }),
  ).rejects.toBe(error);
});
