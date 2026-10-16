import type { ConnectedAccount } from "@pond/schema/db";
import type { Group, Query } from "@pond/schema/filters/types";
import { twitterSyncPreferences } from "./twitter-sync";

/** Unknown membership stays visible so manually saved posts aren't hidden by sync settings. */
export function withTwitterLibraryVisibility(
  query: Query,
  accounts: Record<string, ConnectedAccount>,
): Query {
  const restrictions: Group[] = [];
  for (const account of Object.values(accounts)) {
    if (account.source !== "twitter") continue;
    const { lists } = twitterSyncPreferences(account.sync.twitter);
    if (lists.length === 2) continue;
    restrictions.push({
      combinator: "or",
      rules: [
        { field: "account", operator: "neq", value: account.id },
        { field: "list", operator: "empty", value: true },
        { field: "list", operator: "some", value: lists },
      ],
    });
  }
  return restrictions.length === 0
    ? query
    : { combinator: "and", rules: [query, ...restrictions] };
}
