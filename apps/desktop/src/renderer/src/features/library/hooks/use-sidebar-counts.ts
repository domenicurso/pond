import type { LibrarySidebarCounts } from "@shared/sidebar-counts";
import { useEffect, useState } from "react";
import { useRecents } from "@/features/saves";
import { subscribePrefsSnapshot } from "@/shared/state/prefs";

const EMPTY: LibrarySidebarCounts = {
  library: 0,
  uncategorized: 0,
  untagged: 0,
  recentlyAdded: 0,
  recentlyUsed: 0,
  trash: 0,
  folders: {},
};
export function useSidebarCounts(): LibrarySidebarCounts {
  const recentKey = useRecents()
    .map((entry) => entry.saveId)
    .join("\0");
  const [counts, setCounts] = useState(EMPTY);
  useEffect(() => {
    const recentIds = recentKey ? recentKey.split("\0") : [];
    let active = true;
    let pending = false;
    let dirty = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = undefined;
        void refresh();
      }, 150);
    };
    const refresh = async () => {
      if (pending) {
        dirty = true;
        return;
      }
      pending = true;
      dirty = false;
      try {
        const next = await window.pond.query("saves.sidebarCounts", {
          recentIds,
        });
        if (active && next) setCounts(next);
      } catch (error) {
        console.warn("[pond] sidebar counts failed", error);
      } finally {
        pending = false;
        if (active && dirty) schedule();
      }
    };
    void refresh();
    const off = window.pond.onSyncAction(schedule);
    const offPrefs = subscribePrefsSnapshot(schedule);
    return () => {
      active = false;
      off();
      offPrefs();
      if (timer) clearTimeout(timer);
    };
  }, [recentKey]);
  return counts;
}
