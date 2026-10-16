import {
  isTextCardThumbnailPath,
  isThumbnailKind,
  THUMBNAIL_DARK_KIND,
  THUMBNAIL_KIND,
} from "@shared/save-file-names";
import {
  RENDER_TEXT_COVER_VERSION,
  textCoverVersionFromRawJson,
} from "@shared/text-card";
import { hasArchive } from "@/features/saves/lib/media/archive";
import {
  isTextOnlyAsideFromCover,
  textBodyForSave,
} from "@/features/saves/lib/text";
import type { Save, SaveFile } from "@/features/saves/types";
import {
  type ResolvedTheme,
  resolveCurrentTheme,
} from "@/shared/hooks/use-resolved-theme";

import { isAuxiliaryFile } from "./file-classification";

const TWEET_SCREENSHOT_LIGHT_KIND = "tweet_screenshot_light";
const TWEET_SCREENSHOT_DARK_KIND = "tweet_screenshot_dark";

export function pickThumbnailFile(
  save: Save,
  theme: ResolvedTheme | undefined,
): SaveFile | null {
  const files = save.files ?? [];
  const hasOriginal = files.some((file) => !isAuxiliaryFile(file));
  const usable = (file: SaveFile) =>
    isThumbnailKind(file.kind) &&
    (!hasOriginal || !isTextCardThumbnailPath(file.path));
  const resolved = theme ?? resolveCurrentTheme();
  const preferred = resolved === "dark" ? THUMBNAIL_DARK_KIND : THUMBNAIL_KIND;
  const other = resolved === "dark" ? THUMBNAIL_KIND : THUMBNAIL_DARK_KIND;
  return (
    files.find((file) => file.kind === preferred && usable(file)) ??
    files.find((file) => file.kind === other && usable(file)) ??
    null
  );
}

export function pickTweetScreenshot(
  save: Save,
  theme: ResolvedTheme | undefined,
): SaveFile | null {
  if (save.source !== "twitter" && save.source !== "threads") return null;
  const files = save.files ?? [];
  const resolved = theme ?? resolveCurrentTheme();
  const preferredKind =
    resolved === "light"
      ? TWEET_SCREENSHOT_LIGHT_KIND
      : TWEET_SCREENSHOT_DARK_KIND;
  const otherKind =
    resolved === "light"
      ? TWEET_SCREENSHOT_DARK_KIND
      : TWEET_SCREENSHOT_LIGHT_KIND;
  return (
    files.find((f) => f.kind === preferredKind) ??
    files.find((f) => f.kind === otherKind) ??
    null
  );
}

export function needsTextCover(save: Save): boolean {
  if (save.source === "twitter" || save.source === "threads") return false;
  if (hasArchive(save)) return false;
  if (!textBodyForSave(save)) return false;
  if (!isTextOnlyAsideFromCover(save)) return false;
  const hasThumb = (save.files ?? []).some((file) =>
    isThumbnailKind(file.kind),
  );
  if (!hasThumb) return true;
  return textCoverVersionFromRawJson(save.rawJson) < RENDER_TEXT_COVER_VERSION;
}
