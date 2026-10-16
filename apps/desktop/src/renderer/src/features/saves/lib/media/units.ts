import type { TweetCover } from "@pond/schema/db";
import {
  classifyLibraryFile,
  requiresGeneratedImagePreview,
} from "@shared/file-format";
import { buildPondUrl } from "@/features/saves/lib/media/url";
import type { Save, SaveFile } from "@/features/saves/types";
import { getPrefsSnapshot } from "@/shared/state/prefs";

import { pickThumbnailFile, pickTweetScreenshot } from "./covers";
import { isAuxiliaryFile } from "./file-classification";
import { buildMediaUnits } from "./media-file-units";
import type { MediaPickOptions, MediaUnit } from "./media-unit";

export { needsTextCover } from "./covers";
export {
  deriveTypeKind,
  deriveTypeLabel,
  isImageFile,
} from "./file-classification";
export { buildMediaUnits } from "./media-file-units";
export type { MediaPickOptions, MediaUnit } from "./media-unit";

function resolveCurrentTweetCover(): TweetCover {
  return getPrefsSnapshot()?.preferences?.tweetCover ?? "media";
}

export function pickPrimaryUnit(
  save: Save,
  opts: MediaPickOptions = {},
): MediaUnit | null {
  const units = buildMediaUnits(save, opts);
  const video = units.find((unit) => unit.isVideo);
  if (video) return video;
  const mode = opts.tweetCover ?? resolveCurrentTweetCover();
  const screenshot = pickTweetScreenshot(save, opts.theme);
  if (screenshot && mode === "screenshot") {
    return {
      key: screenshot.path,
      url: buildPondUrl(save.id, screenshot),
      isVideo: false,
    };
  }

  return units[0] ?? null;
}

export function pickCardUnit(
  save: Save,
  opts: MediaPickOptions = {},
): MediaUnit | null {
  const video = buildMediaUnits(save, opts).find((unit) => unit.isVideo);
  if (video) return video;
  const mode = opts.tweetCover ?? resolveCurrentTweetCover();
  const thumbnail =
    (mode === "screenshot" ? pickTweetScreenshot(save, opts.theme) : null) ??
    pickThumbnailFile(save, opts.theme);
  if (thumbnail) {
    const unit: MediaUnit = {
      key: thumbnail.path,
      url: buildPondUrl(save.id, thumbnail),
      isVideo: false,
    };
    if (requiresGeneratedImagePreview(thumbnail.path)) {
      unit.requiresGeneratedPreview = true;
    }
    return unit;
  }

  const primary = pickPrimaryUnit(save, opts);
  if (primary) return primary;

  const previewable = (save.files ?? []).find((file) => {
    if (isAuxiliaryFile(file)) return false;
    const kind = classifyLibraryFile(file.path, file.mimeType).previewKind;
    return (
      kind === "audio" ||
      kind === "pdf" ||
      kind === "font" ||
      kind === "generic"
    );
  });
  return previewable
    ? {
        key: previewable.path,
        url: buildPondUrl(save.id, previewable),
        isVideo: false,
        requiresGeneratedPreview: true,
      }
    : null;
}

export function pickPrimaryFile(
  save: Save,
  opts: MediaPickOptions = {},
): SaveFile | null {
  const unit = pickPrimaryUnit(save, opts);
  if (unit) {
    const file = (save.files ?? []).find((f) => f.path === unit.key);
    if (file) return file;
  }
  return (save.files ?? []).find((file) => !isAuxiliaryFile(file)) ?? null;
}
