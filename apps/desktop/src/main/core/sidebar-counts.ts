import { saves } from "@pond/schema/db";
import { EMPTY_QUERY, type Query } from "@pond/schema/filters";
import { and, count, inArray, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import { recentlyAddedSince } from "../../shared/recently-added";
import type { LibrarySidebarCounts } from "../../shared/sidebar-counts";
import type { Db } from "../db";
import { libraryQueryWhere } from "./library-query";

export function querySidebarCounts(
  db: Db,
  hiddenFolderIds: readonly string[] = [],
  recentIds: readonly string[] = [],
  now = Date.now(),
): LibrarySidebarCounts {
  return querySidebarCountsForScope(db, { hiddenFolderIds, recentIds, now });
}

interface SidebarScope {
  hiddenFolderIds?: readonly string[];
  recentIds?: readonly string[];
  now?: number;
  query?: Query;
}

export function querySidebarCountsForScope(
  db: Db,
  scope: SidebarScope,
): LibrarySidebarCounts {
  const {
    hiddenFolderIds = [],
    recentIds = [],
    now = Date.now(),
    query = EMPTY_QUERY,
  } = scope;
  return db.$raw.transaction(() => {
    const live = libraryQueryWhere({ query }, hiddenFolderIds);
    const rows = countLiveScopes(db, live, now);
    const folderRows = countFolderScopes(db, live);
    return {
      library: rows?.library ?? 0,
      untagged: rows?.untagged ?? 0,
      uncategorized: rows?.uncategorized ?? 0,
      recentlyAdded: rows?.recentlyAdded ?? 0,
      recentlyUsed:
        recentIds.length === 0
          ? 0
          : (db
              .select({ n: count() })
              .from(saves)
              .where(and(live, inArray(saves.id, [...recentIds])))
              .get()?.n ?? 0),
      trash:
        db
          .select({ n: count() })
          .from(saves)
          .where(isNotNull(saves.deletedAt))
          .get()?.n ?? 0,
      folders: Object.fromEntries(folderRows.map((row) => [row.id, row.n])),
    };
  })();
}

function countLiveScopes(
  db: Db,
  live: ReturnType<typeof libraryQueryWhere>,
  now: number,
) {
  return db
    .select({
      library: count(),
      untagged: sql<number>`sum(case when json_array_length(coalesce(${saves.tags},'[]'))=0 then 1 else 0 end)`,
      uncategorized: sql<number>`sum(case when not exists(select 1 from save_folders where save_id=${saves.id}) then 1 else 0 end)`,
      recentlyAdded: sql<number>`sum(case when ${saves.savedAt} >= ${recentlyAddedSince(now)} then 1 else 0 end)`,
    })
    .from(saves)
    .where(live)
    .get();
}

function countFolderScopes(db: Db, live: ReturnType<typeof libraryQueryWhere>) {
  return z.array(z.object({ id: z.string(), n: z.number() })).parse(
    db.all(
      sql`with recursive folder_tree(root_id,folder_id) as (
            select id,id from folders
            union
            select folder_tree.root_id,folders.id
            from folder_tree
            join folders on folders.parent_id=folder_tree.folder_id
          )
          select folder_tree.root_id as id,count(distinct save_folders.save_id) as n
          from folder_tree
          join save_folders on save_folders.folder_id=folder_tree.folder_id
          join saves on saves.id=save_folders.save_id
          where ${live}
          group by folder_tree.root_id`,
    ),
  );
}
