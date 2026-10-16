import { classifyLibraryFile, typeLabelForPath } from "@shared/file-format";
import {
  isAuxiliaryKind,
  isOriginalImageKind,
  isPostRenderKind,
} from "@shared/save-file-names";
import { hasArchive, isArchiveFile } from "@/features/saves/lib/media/archive";
import {
  arenaBlockClass,
  isTextOnlyAsideFromCover,
  textBodyForSave,
} from "@/features/saves/lib/text";
import type { Save, SaveFile } from "@/features/saves/types";

export function isAuxiliaryFile(file: SaveFile): boolean {
  return (
    isAuxiliaryKind(file.kind) ||
    isArchiveFile(file) ||
    isPostRenderKind(file.kind)
  );
}

export function isImageFile(file: SaveFile): boolean {
  if (isOriginalImageKind(file.kind)) return true;
  const previewKind = classifyLibraryFile(file.path, file.mimeType).previewKind;
  return previewKind === "direct-image" || previewKind === "native-image";
}

type TypeKind =
  | "image"
  | "video"
  | "audio"
  | "font"
  | "link"
  | "text"
  | "doc"
  | "other";

export function deriveTypeKind(file: SaveFile | null, save: Save): TypeKind {
  if (save.source === "web") return "link";

  if (file) {
    const format = classifyLibraryFile(file.path, file.mimeType);
    if (format.mediaType === "image") return "image";
    if (format.mediaType === "video") return "video";
    if (format.mediaType === "audio") return "audio";
    if (format.mediaType === "font") return "font";
    if (format.mediaType === "document") return "doc";
    if (format.mediaType === "text") return "text";
    if (isOriginalImageKind(file.kind)) return "image";
  }

  const media = save.mediaType?.toLowerCase();
  if (media === "text") return "text";
  if (media === "image") return "image";
  if (media === "video") return "video";
  if (media === "audio") return "audio";
  if (media === "document") return "doc";
  if (media === "font") return "font";
  if (media === "file") return "other";
  if (media === "link") return "link";

  return save.url ? "link" : "other";
}

export function deriveTypeLabel(
  file: SaveFile | null,
  save: Save,
): string | null {
  if (save.source === "web") return "Web";
  if (arenaBlockClass(save) === "text") return "Text";
  if (
    !file &&
    !hasArchive(save) &&
    textBodyForSave(save).length > 0 &&
    isTextOnlyAsideFromCover(save)
  ) {
    return "Text";
  }
  const extensionLabel = file ? typeLabelForPath(file.path) : null;
  if (extensionLabel) return extensionLabel;
  const subtype = file?.mimeType?.split("/")[1]?.split(";")[0];
  if (subtype) return subtype.toUpperCase();
  const media = save.mediaType?.toLowerCase();
  if (media === "text") return "Text";
  if (media === "video") return "Video";
  if (media === "image") return "Image";
  if (media === "link") return "Website";
  if (save.mediaType) return save.mediaType.toUpperCase();
  return save.url ? "Link" : null;
}
