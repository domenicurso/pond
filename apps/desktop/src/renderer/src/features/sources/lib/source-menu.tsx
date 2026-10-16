import { IconArrowRotateClockwise, IconGrid } from "@pond/icons";
import type { MenuItemSpec } from "@pond/ui";
import { viewAccountItems } from "@/features/library";
import { connectionItems, fetchItems } from "./source-menu-actions";
import { copyItems, profileItems } from "./source-menu-identity";
import type { SourceMenuOptions, SourceMenuTarget } from "./source-menu-target";
import { twitterSyncMenu } from "./twitter-sync-menu";

export type { SourceMenuOptions, SourceMenuTarget } from "./source-menu-target";
export { accountMenuTarget, watchMenuTarget } from "./source-menu-target";

function singleSourceMenu(
  target: SourceMenuTarget,
  options: SourceMenuOptions,
): MenuItemSpec[] {
  return [
    { type: "group", items: profileItems(target) },
    { type: "separator" },
    { type: "group", items: copyItems(target) },
    { type: "separator" },
    {
      type: "group",
      items: [...fetchItems(target), ...twitterSyncMenu(target, options)],
    },
    { type: "separator" },
    {
      type: "group",
      items: connectionItems(target, options),
    },
  ];
}

function batchSourceMenu(targets: readonly SourceMenuTarget[]): MenuItemSpec[] {
  const fetchable = targets.filter(
    (target) => target.model.connected && target.model.tone !== "run",
  );
  return [
    {
      type: "group",
      items: [
        {
          label: "Show Saved Items",
          icon: <IconGrid />,
          onClick: () => viewAccountItems(targets.map((target) => target.id)),
        },
      ],
    },
    { type: "separator" },
    {
      type: "group",
      items: [
        {
          label: "Fetch New Saves",
          icon: <IconArrowRotateClockwise />,
          disabled: fetchable.length === 0,
          onClick: () => {
            for (const target of fetchable) {
              void window.pond.syncRunNow(target.id);
            }
          },
        },
      ],
    },
  ];
}

export function buildSourceActionMenu(
  targetOrTargets: SourceMenuTarget | readonly SourceMenuTarget[],
  options: SourceMenuOptions = {},
): MenuItemSpec[] {
  const targets = Array.isArray(targetOrTargets)
    ? targetOrTargets
    : [targetOrTargets];
  const target = targets[0];
  if (!target) return [];
  return targets.length === 1
    ? singleSourceMenu(target, options)
    : batchSourceMenu(targets);
}
