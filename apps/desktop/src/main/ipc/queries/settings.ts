import {
  DEFAULT_IMAGE_DOWNLOAD,
  DEFAULT_VIDEO_DOWNLOAD,
  settings as settingsTable,
} from "@pond/schema/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { FEEDBACK_EVENTS } from "../../../shared/feedback";
import type { QueryResult } from "../../../shared/query-contracts";
import type { OkFailure } from "../../../shared/query-contracts-shared";
import {
  emitRendererFeedback,
  openNotificationSettings,
} from "../../core/feedback";
import { globalShortcutStatus } from "../../core/global-shortcuts";
import {
  getImageDownloadPrefs,
  getPrefs,
  getVideoDownloadPrefs,
  setImageDownloadPrefs,
  setPrefs,
  setVideoDownloadPrefs,
} from "../../core/prefs";
import { getGlobalDb } from "../../db";
import { getIngestToken, rotateIngestToken } from "../../keychain";
import { syncShellChrome } from "../../window";
import { type QueryHandlerMap, query } from "./params";

const VideoDownloadPatchSchema = z.object({
  enabled: z.boolean().optional().catch(undefined),
  maxHeight: z.number().nullable().optional().catch(undefined),
  maxFps: z.number().nullable().optional().catch(undefined),
  videoCodec: z
    .enum(["h264", "hevc", "av1", "vp9", "any"])
    .optional()
    .catch(undefined),
  audioCodec: z.enum(["aac", "opus", "any"]).optional().catch(undefined),
  container: z
    .enum(["auto", "mp4", "mkv", "webm", "mov"])
    .optional()
    .catch(undefined),
  maxFileSizeMb: z.number().nullable().optional().catch(undefined),
  subtitles: z.enum(["off", "download", "embed"]).optional().catch(undefined),
  subtitleLang: z.string().optional().catch(undefined),
  embedMetadata: z.boolean().optional().catch(undefined),
  embedThumbnail: z.boolean().optional().catch(undefined),
  embedChapters: z.boolean().optional().catch(undefined),
  sponsorblockRemove: z.boolean().optional().catch(undefined),
});

const ImageDownloadPatchSchema = z.object({
  maxLongEdge: z.number().nullable().optional().catch(undefined),
  format: z
    .enum(["original", "jpeg", "png", "webp", "avif"])
    .optional()
    .catch(undefined),
  quality: z.number().optional().catch(undefined),
  lossless: z.boolean().optional().catch(undefined),
  progressive: z.boolean().optional().catch(undefined),
  preserveMetadata: z.boolean().optional().catch(undefined),
  maxFileSizeMb: z.number().nullable().optional().catch(undefined),
});

const PrefsPatchParamsSchema = z.looseObject({
  preferences: z.looseObject({}).catch({}).optional(),
  window: z
    .looseObject({ appIcon: z.string().optional().catch(undefined) })
    .catch({})
    .optional(),
});

const NOTIFICATION_SETTINGS_UNAVAILABLE: OkFailure = {
  ok: false,
  error: "Open notification settings from your system settings.",
};

export const settingsQueries = {
  async "settings.get"() {
    const db = await getGlobalDb();
    const rows = await db
      .select()
      .from(settingsTable)
      .where(eq(settingsTable.id, "singleton"));
    const videoDownload = await getVideoDownloadPrefs();
    const imageDownload = await getImageDownloadPrefs();
    if (rows[0]) {
      return { ...rows[0], videoDownload, imageDownload };
    }
    await db
      .insert(settingsTable)
      .values({
        id: "singleton",
        videoDownload: DEFAULT_VIDEO_DOWNLOAD,
        imageDownload: DEFAULT_IMAGE_DOWNLOAD,
      })
      .onConflictDoNothing()
      .run();
    return {
      id: "singleton",
      videoDownload,
      imageDownload,
      libraryRoot: null,
      updatedAt: new Date(),
    };
  },

  "settings.setVideoDownload": query(
    VideoDownloadPatchSchema,
    async (params) => {
      const next = await setVideoDownloadPrefs(params);
      return { ok: true, videoDownload: next };
    },
  ),

  "settings.setImageDownload": query(
    ImageDownloadPatchSchema,
    async (params) => {
      const next = await setImageDownloadPrefs(params);
      return { ok: true, imageDownload: next };
    },
  ),

  async "settings.ingestToken"() {
    return { token: await getIngestToken() };
  },

  async "settings.rotateIngestToken"() {
    return { token: await rotateIngestToken() };
  },

  async "settings.getOnboarded"() {
    const db = await getGlobalDb();
    const rows = await db
      .select({ onboarded: settingsTable.onboarded })
      .from(settingsTable)
      .where(eq(settingsTable.id, "singleton"));
    return { onboarded: rows[0]?.onboarded ?? false };
  },

  async "settings.setOnboarded"() {
    const db = await getGlobalDb();
    await db
      .insert(settingsTable)
      .values({ id: "singleton" })
      .onConflictDoNothing()
      .run();
    await db
      .update(settingsTable)
      .set({ onboarded: true, updatedAt: new Date() })
      .where(eq(settingsTable.id, "singleton"))
      .run();
    return { ok: true };
  },

  "settings.globalShortcutStatus"() {
    return globalShortcutStatus();
  },
  async "settings.getPrefs"() {
    return await getPrefs();
  },

  "settings.setPrefs": query(
    PrefsPatchParamsSchema,
    async (params): Promise<QueryResult<"settings.setPrefs">> => {
      const next = await setPrefs(params);
      if ("sync" in params) {
        const { enforceTwitterDownloadSelection } = await import(
          "../../core/pipeline/twitter-download-selection"
        );
        const { cancelSaveIngest } = await import(
          "../../core/pipeline/reconciler-client"
        );
        await enforceTwitterDownloadSelection(cancelSaveIngest);
      }
      if ("preferences" in params) await syncShellChrome();
      if (params.window && "appIcon" in params.window) {
        const { applyAppIcon } = await import("../../core/app-icon");
        await applyAppIcon(params.window.appIcon);
      }
      return { ok: true, prefs: next };
    },
  ),

  "feedback.emit": query(
    z.object({ event: z.enum(FEEDBACK_EVENTS) }),
    async ({ event }) => {
      await emitRendererFeedback(event);
      return { ok: true as const };
    },
  ),

  "notifications.openSettings": query(z.object({}), async () =>
    (await openNotificationSettings())
      ? { ok: true as const }
      : NOTIFICATION_SETTINGS_UNAVAILABLE,
  ),
} satisfies QueryHandlerMap;
