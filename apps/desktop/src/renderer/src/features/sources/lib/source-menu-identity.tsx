import {
  IconArrowUpRight,
  IconCopy,
  IconCopyId,
  IconGrid,
  IconLink2,
} from "@pond/icons";
import type { MenuItemSpec } from "@pond/ui";
import { viewAccountItems } from "@/features/library";
import { getSourceDef } from "@/features/sources/lib/registry";
import { sourceTargetUrl } from "@/features/sources/lib/source-target-url";
import { notify } from "@/shared/lib/toast";

import type { SourceMenuTarget } from "./source-menu-target";

function targetKind(target: SourceMenuTarget): string {
  switch (target.watchKind) {
    case "playlist":
      return "Playlist";
    case "list":
      return "List";
    case "board":
      return "Board";
    case "cluster":
      return "Cluster";
    case "channel":
      return "Channel";
    case "group":
      return "Group";
    default:
      return "Profile";
  }
}

function identityKind(target: SourceMenuTarget): string {
  switch (target.watchKind) {
    case "playlist":
      return "Playlist ID";
    case "list":
      return "List ID";
    case "board":
      return "Board Path";
    case "cluster":
      return "Cluster Path";
    case "channel":
      return "Channel Handle";
    case "group":
      return "Group Handle";
    default:
      return "Username";
  }
}

export function targetName(target: SourceMenuTarget): string {
  if (target.label) return target.label;
  if (target.handle) {
    return target.watchKind === "playlist" || target.watchKind === "list"
      ? target.handle
      : `@${target.handle}`;
  }
  return getSourceDef(target.source).label;
}

export async function copyText(
  text: string,
  id: string,
  successTitle: string,
): Promise<void> {
  const result = await window.pond.query("clipboard.writeText", { text });
  notify({
    id,
    title: result.ok ? successTitle : "Couldn't copy. Try again.",
  });
}

export function profileItems(target: SourceMenuTarget): MenuItemSpec[] {
  const sourceLabel = getSourceDef(target.source).label;
  const kind = targetKind(target);
  const url = sourceTargetUrl({
    source: target.source,
    handle: target.handle,
    kind: target.watchKind,
  });
  return [
    {
      label: `Open ${sourceLabel} ${kind}`,
      icon: <IconArrowUpRight />,
      hidden: !url,
      onClick: url
        ? () => {
            void window.pond.openExternal(url).then((result) => {
              if (result.ok) return;
              notify({
                id: "source-open-profile",
                title: `Couldn't open ${sourceLabel}. Try again.`,
              });
            });
          }
        : undefined,
    },
    {
      label: "Show Saved Items",
      icon: <IconGrid />,
      onClick: () => viewAccountItems(target.id),
    },
  ];
}

export function copyItems(target: SourceMenuTarget): MenuItemSpec[] {
  const kind = targetKind(target);
  const identity = identityKind(target);
  const url = sourceTargetUrl({
    source: target.source,
    handle: target.handle,
    kind: target.watchKind,
  });
  return [
    {
      label: `Copy ${kind} Link`,
      icon: <IconLink2 />,
      hidden: !url,
      onClick: url
        ? () => void copyText(url, "source-copy-link", `${kind} link copied`)
        : undefined,
    },
    {
      label: `Copy ${identity}`,
      icon: <IconCopy />,
      hidden: !target.handle,
      onClick: target.handle
        ? () =>
            void copyText(
              target.handle ?? "",
              "source-copy-identity",
              `${identity} copied`,
            )
        : undefined,
    },
    {
      label: "Copy Connection ID",
      icon: <IconCopyId />,
      onClick: () =>
        void copyText(
          target.id,
          "source-copy-connection-id",
          "Connection ID copied",
        ),
    },
  ];
}
