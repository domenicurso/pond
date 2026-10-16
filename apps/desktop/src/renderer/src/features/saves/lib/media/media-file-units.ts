import {
  classifyLibraryFile,
  requiresGeneratedImagePreview,
} from "@shared/file-format";
import { isVideoFile } from "@shared/media-index";
import { isAuxiliaryKind, isPostRenderKind } from "@shared/save-file-names";
import { isArchiveFile } from "@/features/saves/lib/media/archive";
import { buildPondUrl } from "@/features/saves/lib/media/url";
import type { Save, SaveFile } from "@/features/saves/types";

import { pickTweetScreenshot } from "./covers";
import { isImageFile } from "./file-classification";
import type { MediaPickOptions, MediaUnit } from "./media-unit";

function isRenderableVideoFile(file: SaveFile): boolean {
  return (
    isVideoFile(file) &&
    classifyLibraryFile(file.path, file.mimeType).previewKind === "video"
  );
}

function mediaFileUnits(
  saveId: string,
  files: SaveFile[],
  posters: SaveFile[],
): MediaUnit[] {
  const units: MediaUnit[] = [];
  let videoSeen = 0;
  for (const f of files) {
    if (isRenderableVideoFile(f)) {
      const poster = posters[videoSeen] ?? posters[0];
      const unit: MediaUnit = {
        key: f.path,
        url: buildPondUrl(saveId, f),
        isVideo: true,
      };
      if (poster) {
        unit.posterUrl = buildPondUrl(saveId, poster);
        unit.posterKey = poster.path;
      }
      units.push(unit);
      videoSeen++;
    } else if (isImageFile(f)) {
      const unit: MediaUnit = {
        key: f.path,
        url: buildPondUrl(saveId, f),
        isVideo: false,
      };
      if (requiresGeneratedImagePreview(f.path)) {
        unit.requiresGeneratedPreview = true;
      }
      units.push(unit);
    }
  }
  return units;
}

export function buildMediaUnits(
  save: Save,
  opts: MediaPickOptions = {},
): MediaUnit[] {
  const allFiles = save.files ?? [];
  const posters = allFiles.filter((f) => f.kind === "poster");
  const files = allFiles.filter(
    (f) =>
      !isAuxiliaryKind(f.kind) &&
      !isArchiveFile(f) &&
      !isPostRenderKind(f.kind),
  );

  const videos = files.filter(isRenderableVideoFile);
  const images = files.filter(isImageFile);

  if (videos.length === 1 && images.length <= 1) {
    const video = videos[0];
    if (!video) return [];
    const poster = posters[0] ?? images[0];
    const unit: MediaUnit = {
      key: video.path,
      url: buildPondUrl(save.id, video),
      isVideo: true,
    };
    if (poster) {
      unit.posterUrl = buildPondUrl(save.id, poster);
      unit.posterKey = poster.path;
    }
    return [unit];
  }

  const units = mediaFileUnits(save.id, files, posters);
  if (units.length > 0) return units;

  const screenshot = pickTweetScreenshot(save, opts.theme);
  if (screenshot) {
    return [
      {
        key: screenshot.path,
        url: buildPondUrl(save.id, screenshot),
        isVideo: false,
      },
    ];
  }

  return units;
}
