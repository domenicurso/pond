import type { TwitterSyncPreferences } from "@pond/schema/db";
import type { MenuItemSpec } from "@pond/ui";
import { twitterSyncPreferences } from "@shared/twitter-sync";
import { notify } from "@/shared/lib/toast";
import { getPrefsSnapshot, savePrefsSection } from "@/shared/state/prefs";
import type { SourceMenuOptions, SourceMenuTarget } from "./source-menu-target";

async function saveSelection(
  target: SourceMenuTarget,
  selection: TwitterSyncPreferences,
  options: SourceMenuOptions,
): Promise<void> {
  try {
    const account = getPrefsSnapshot()?.sync.accounts[target.id];
    if (!account) throw new Error("Account is unavailable");
    await savePrefsSection("sync", {
      accounts: {
        [target.id]: {
          ...account,
          sync: { ...account.sync, twitter: selection, lastFullSyncAt: null },
        },
      },
    });
    options.onChanged?.();
  } catch (error) {
    notify({
      id: "twitter-sync-options",
      title: "Couldn't save Twitter sync options. Try again.",
    });
    console.warn("[sources] Twitter sync options failed", error);
  }
}

export function twitterSyncMenu(
  target: SourceMenuTarget,
  options: SourceMenuOptions,
): MenuItemSpec[] {
  if (target.type !== "account" || target.source !== "twitter") return [];
  const selection = twitterSyncPreferences(target.twitterSync);
  const disabled = target.model.tone === "run";
  return [
    {
      type: "submenu",
      label: "Sync Content",
      disabled,
      items: [
        ...(["saved", "liked"] as const).map(
          (kind): MenuItemSpec => ({
            type: "checkbox",
            label: kind === "saved" ? "Bookmarks" : "Likes",
            checked: selection.lists.includes(kind),
            disabled:
              selection.lists.length === 1 && selection.lists.includes(kind),
            onCheckedChange: (checked) => {
              const lists = checked
                ? [...selection.lists, kind]
                : selection.lists.filter((list) => list !== kind);
              void saveSelection(target, { ...selection, lists }, options);
            },
          }),
        ),
        { type: "separator" },
        ...(["all", "media"] as const).map(
          (content): MenuItemSpec => ({
            type: "checkbox",
            indicator: "check",
            label: content === "all" ? "All Posts" : "Posts with Media",
            checked: selection.content === content,
            onCheckedChange: () => {
              void saveSelection(target, { ...selection, content }, options);
            },
          }),
        ),
      ],
    },
  ];
}
