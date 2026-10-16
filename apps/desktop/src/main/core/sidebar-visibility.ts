import { EMPTY_QUERY } from "@pond/schema/filters";
import { withTwitterLibraryVisibility } from "../../shared/twitter-library-visibility";
import type { Db } from "../db";
import { getPrefs } from "./prefs";
import { querySidebarCountsForScope } from "./sidebar-counts";

/** Resolve account settings in main so counts agree with the renderer's filtered queries. */
export async function queryConfiguredSidebarCounts(
  db: Db,
  hiddenFolderIds: readonly string[] = [],
  recentIds: readonly string[] = [],
) {
  const prefs = await getPrefs();
  return querySidebarCountsForScope(db, {
    hiddenFolderIds,
    recentIds,
    query: withTwitterLibraryVisibility(EMPTY_QUERY, prefs.sync.accounts),
  });
}
