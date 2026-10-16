import * as schema from "@pond/schema/db";
import * as events from "@pond/schema/events";
import { EMPTY_QUERY, QuerySchema } from "@pond/schema/filters";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { afterEach, expect, it } from "vitest";
import { withTwitterLibraryVisibility } from "../../shared/twitter-library-visibility";
import { initializePondSchema } from "../db";
import { queryLibraryIds, queryLibraryPage } from "./library-query";
import { querySidebarCountsForScope } from "./sidebar-counts";

const opened: Database.Database[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});
function account(
  lists: schema.TwitterSyncPreferences["lists"],
): schema.ConnectedAccount {
  return {
    id: "alice",
    source: "twitter",
    handle: "alice",
    identityKey: null,
    label: null,
    addedAt: "",
    sync: {
      ...schema.DEFAULT_SOURCE_SYNC_PREFS,
      twitter: { lists, content: "all" },
    },
  };
}
function setup() {
  const sqlite = new Database(":memory:");
  opened.push(sqlite);
  initializePondSchema(sqlite, () => false);
  const db = Object.assign(
    drizzle(sqlite, { schema: { ...schema, ...events } }),
    { $raw: sqlite },
  );
  const insert =
    sqlite.prepare(`insert into saves(id,source,source_id,url,saved_at,created_at,status,account_id,list_kinds)
    values (?, ?, ?, 'https://x.com/post', 1, 1, 'complete', ?, ?)`);
  for (const [id, source, owner, lists] of [
    ["liked", "twitter", "alice", '["liked"]'],
    ["saved", "twitter", "alice", '["saved"]'],
    ["both", "twitter", "alice", '["saved","liked"]'],
    ["unknown", "twitter", "alice", "[]"],
    ["other", "twitter", "bob", '["liked"]'],
    ["manual", "twitter", null, '["liked"]'],
    ["web", "web", "web-account", '["liked"]'],
  ])
    insert.run(id, source, id, owner, lists);
  sqlite.exec(
    "insert into folders(id,name) values ('folder','Folder'); insert into save_folders(save_id,folder_id) select id,'folder' from saves",
  );
  return { db, sqlite };
}
function request(lists: schema.TwitterSyncPreferences["lists"]) {
  return {
    query: QuerySchema.parse(
      withTwitterLibraryVisibility(EMPTY_QUERY, { alice: account(lists) }),
    ),
  };
}

it("hides liked-only imports, retains bookmarked overlap, and restores the archive when re-enabled", async () => {
  const { db, sqlite } = setup();
  const hidden = (await queryLibraryIds(db, "library", request(["saved"]))).ids;
  expect(hidden.sort()).toEqual([
    "both",
    "manual",
    "other",
    "saved",
    "unknown",
    "web",
  ]);
  expect(
    (await queryLibraryIds(db, "library", request(["liked"]))).ids,
  ).not.toContain("saved");
  expect(
    (await queryLibraryIds(db, "library", request(["saved", "liked"]))).ids,
  ).toHaveLength(7);
  expect(sqlite.prepare("select count(*) as n from saves").get()).toEqual({
    n: 7,
  });
});

it("filters before pagination and uses the same selection for folder and sidebar counts", async () => {
  const { db } = setup();
  const selected = request(["saved"]);
  const ids: string[] = [];
  let page = await queryLibraryPage(db, "library", { ...selected, limit: 2 });
  ids.push(...page.ids);
  while (page.nextCursor) {
    page = await queryLibraryPage(db, "library", {
      ...selected,
      limit: 2,
      cursor: page.nextCursor,
    });
    ids.push(...page.ids);
  }
  expect(ids).toHaveLength(6);
  expect(ids).not.toContain("liked");
  const counts = querySidebarCountsForScope(db, {
    query: selected.query,
    recentIds: ["liked", "saved"],
  });
  expect(counts).toMatchObject({
    library: 6,
    untagged: 6,
    recentlyUsed: 1,
    folders: { folder: 6 },
  });
});

it("combines visibility with existing OR filters without widening their results", async () => {
  const { db } = setup();
  const query = withTwitterLibraryVisibility(
    {
      combinator: "or",
      rules: [
        { field: "account", operator: "eq", value: "alice" },
        { field: "account", operator: "eq", value: "bob" },
      ],
    },
    { alice: account(["saved"]) },
  );
  const { ids } = await queryLibraryIds(db, "library", { query });
  expect(ids.sort()).toEqual(["both", "other", "saved", "unknown"]);
});
