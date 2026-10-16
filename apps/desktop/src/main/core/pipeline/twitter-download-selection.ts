import type { ConnectedAccount } from "@pond/schema/db";
import { saves } from "@pond/schema/db";
import { buildWhere, EMPTY_QUERY } from "@pond/schema/filters";
import { and, eq, not, or, sql } from "drizzle-orm";
import { withTwitterLibraryVisibility } from "../../../shared/twitter-library-visibility";
import { twitterSyncPreferences } from "../../../shared/twitter-sync";
import { type Db, getDb } from "../../db";
import { getPrefs } from "../prefs";

type CancelIngest = (saveId: string) => Promise<boolean>;

/** Unknown media stays eligible until harvest; capture metadata excludes link thumbnails and tweet screenshots. */
function tweetHasMedia() {
  return sql`case when json_type(${saves.rawJson}, '$.capture.media') = 'array'
    then exists (select 1 from json_tree(${saves.rawJson}, '$.capture')
      where key = 'type' and value in ('image', 'video', 'gif'))
    else ${saves.mediaType} in ('image', 'video', 'gif', 'carousel') end`;
}

export async function cancelExcludedTwitterDownloads(input: {
  db: Db;
  accounts: Record<string, ConnectedAccount>;
  cancel: CancelIngest;
}): Promise<number> {
  const membership = buildWhere(
    withTwitterLibraryVisibility(EMPTY_QUERY, input.accounts),
  );
  const mediaOnly = Object.values(input.accounts)
    .filter(
      (account) =>
        account.source === "twitter" &&
        twitterSyncPreferences(account.sync.twitter).content === "media",
    )
    .map((account) =>
      and(eq(saves.accountId, account.id), not(tweetHasMedia())),
    );
  const excluded = or(membership ? not(membership) : undefined, ...mediaOnly);
  if (!excluded) return 0;
  const rows = await input.db
    .select({ id: saves.id })
    .from(saves)
    .where(
      and(eq(saves.source, "twitter"), eq(saves.status, "ingesting"), excluded),
    );
  let cancelled = 0;
  for (const { id } of rows) cancelled += Number(await input.cancel(id));
  return cancelled;
}

export async function enforceTwitterDownloadSelection(
  cancel: CancelIngest,
): Promise<void> {
  const prefs = await getPrefs();
  await cancelExcludedTwitterDownloads({
    db: await getDb(),
    accounts: prefs.sync.accounts,
    cancel,
  });
}
