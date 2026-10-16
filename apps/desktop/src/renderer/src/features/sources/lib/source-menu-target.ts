import type {
  Source,
  TwitterSyncPreferences,
  WatchKind,
} from "@pond/schema/db";
import type { CardModel } from "@/features/sources/components/sync-monitor/lib/helpers";
import type { AccountRow } from "@/features/sources/hooks/use-accounts";
import type { WatchRow } from "@/features/sources/hooks/use-watches";
export interface SourceMenuTarget {
  id: string;
  type: "account" | "watch";
  source: Source;
  handle: string | null;
  label: string | null;
  watchKind?: WatchKind;
  model: CardModel;
  knownCount: number;
  lastError: string | null;
  twitterSync?: TwitterSyncPreferences;
}

export interface SourceMenuOptions {
  accounts?: readonly AccountRow[];
  onChanged?: () => void;
}

export function accountMenuTarget(
  account: AccountRow,
  model: CardModel,
): SourceMenuTarget {
  return {
    id: account.id,
    type: "account",
    source: account.source,
    handle: account.handle,
    label: account.label,
    model,
    knownCount: account.sync.knownCount,
    lastError: account.sync.lastError,
    twitterSync: account.sync.twitter,
  };
}

export function watchMenuTarget(
  watch: WatchRow,
  model: CardModel,
): SourceMenuTarget {
  return {
    id: watch.id,
    type: "watch",
    source: watch.source,
    handle: watch.handle,
    label: watch.label,
    watchKind: watch.kind,
    model,
    knownCount: watch.sync.knownCount,
    lastError: watch.sync.lastError,
  };
}
