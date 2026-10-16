import {
  IconArchive,
  IconArrowRotateClockwise,
  IconCopy,
  IconLink2,
  IconNotepad,
  IconTableDownload,
  IconTrash,
} from "@pond/icons";
import type { Source } from "@pond/schema/db";
import { Dialog, type MenuItemSpec } from "@pond/ui";
import type { AccountRow } from "@/features/sources/hooks/use-accounts";
import { getSourceDef } from "@/features/sources/lib/registry";
import { connectFlow } from "@/features/sources/state/connect-flow";
import { sourceDetail } from "@/features/sources/state/source-detail";
import { sourceFlow } from "@/features/sources/state/source-flow";
import { formatNumber } from "@/shared/lib/format";

import { copyText, targetName } from "./source-menu-identity";
import type { SourceMenuOptions, SourceMenuTarget } from "./source-menu-target";

function primaryFetchItem(target: SourceMenuTarget): MenuItemSpec {
  if (target.model.tone === "run") {
    return {
      label: "Cancel Fetch",
      icon: <IconArrowRotateClockwise />,
      onClick: () => void window.pond.syncCancel(target.id),
    };
  }
  return {
    label: target.model.tone === "err" ? "Retry Fetch" : "Fetch New Saves",
    icon: <IconArrowRotateClockwise />,
    disabled: !target.model.connected,
    onClick: () => void window.pond.syncRunNow(target.id),
  };
}

export function fetchItems(target: SourceMenuTarget): MenuItemSpec[] {
  const items: MenuItemSpec[] = [primaryFetchItem(target)];
  if (target.type === "account") {
    items.push(
      {
        label: "Fetch Older Saves",
        icon: <IconArchive />,
        disabled: !target.model.connected || target.model.tone === "run",
        onClick: () =>
          void window.pond.syncRunNow(target.id, { forceFull: true }),
      },
      {
        label: "Fetch Save Details",
        icon: <IconNotepad />,
        disabled: !target.model.connected,
        onClick: () =>
          void window.pond.refreshBackfillStart({ source: target.source }),
      },
      {
        label: "Fetch Original Media",
        icon: <IconTableDownload />,
        disabled: !target.model.connected,
        onClick: () =>
          void window.pond.refreshBackfillStart({
            source: target.source,
            overwrite: true,
          }),
      },
    );
  }
  if (target.model.tone === "err" && target.lastError) {
    items.push({
      label: "Copy Last Fetch Error",
      icon: <IconCopy />,
      onClick: () =>
        void copyText(
          target.lastError ?? "",
          "source-copy-fetch-error",
          "Fetch error copied",
        ),
    });
  }
  return items;
}

function startSourceSignIn(
  source: Source,
  accounts: readonly AccountRow[],
): void {
  connectFlow.start(
    source,
    accounts
      .filter((account) => account.connected)
      .map((account) => account.id),
  );
  sourceFlow.open("connect-wait");
}

function confirmRemove(target: SourceMenuTarget, onChanged: () => void): void {
  const count = target.knownCount;
  const itemCount = `${formatNumber(count)} item${count === 1 ? "" : "s"}`;
  if (target.type === "watch") {
    Dialog.confirm({
      title: "Stop Watching",
      description: `Pond stops checking ${targetName(target)} for new posts. The ${itemCount} already saved stay in your library.`,
      confirmLabel: "Stop",
      onConfirm: async () => {
        await window.pond.query("watches.remove", { watchId: target.id });
        onChanged();
        sourceDetail.close();
      },
    });
    return;
  }

  Dialog.confirm({
    title: "Disconnect",
    description: `Pond signs ${targetName(target)} out and stops its syncing. The ${itemCount} already saved stay in your library.`,
    confirmLabel: "Disconnect",
    onConfirm: async () => {
      await window.pond.query("accounts.disconnect", { accountId: target.id });
      onChanged();
      sourceDetail.close();
    },
  });
}

export function connectionItems(
  target: SourceMenuTarget,
  options: SourceMenuOptions,
): MenuItemSpec[] {
  const sourceLabel = getSourceDef(target.source).label;
  const items: MenuItemSpec[] = [];
  if (target.type === "account") {
    items.push({
      label: "Sign In Again",
      icon: <IconLink2 />,
      onClick: () => startSourceSignIn(target.source, options.accounts ?? []),
    });
  }
  items.push({
    label:
      target.type === "account" ? `Disconnect ${sourceLabel}` : "Stop Watching",
    icon: <IconTrash />,
    variant: "destructive",
    onClick: () =>
      confirmRemove(target, options.onChanged ?? sourceDetail.changed),
  });
  return items;
}
