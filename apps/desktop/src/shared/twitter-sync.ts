import type { TwitterSyncPreferences } from "@pond/schema/db";
import { z } from "zod";

export const TwitterSyncPreferencesSchema = z
  .object({
    lists: z
      .array(z.enum(["saved", "liked"]))
      .min(1)
      .default(["saved", "liked"]),
    content: z.enum(["all", "media"]).default("all"),
  })
  .default({ lists: ["saved", "liked"], content: "all" });

export function twitterSyncPreferences(
  value: TwitterSyncPreferences | undefined,
): TwitterSyncPreferences {
  return TwitterSyncPreferencesSchema.parse(value);
}
