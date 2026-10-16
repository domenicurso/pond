import type { Query } from "@pond/schema/filters/types";
import { withTwitterLibraryVisibility } from "@shared/twitter-library-visibility";
import { useMemo } from "react";
import type { SaveListMode } from "@/features/saves";
import { usePrefs } from "@/shared/state/prefs";

export function useTwitterLibraryQuery(
  query: Query,
  mode: SaveListMode,
): Query {
  const [sync] = usePrefs("sync");
  return useMemo(
    () =>
      mode === "trash"
        ? query
        : withTwitterLibraryVisibility(query, sync.accounts),
    [query, mode, sync.accounts],
  );
}
