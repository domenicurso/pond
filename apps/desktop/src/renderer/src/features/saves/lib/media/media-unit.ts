import type { TweetCover } from "@pond/schema/db";
import type { ResolvedTheme } from "@/shared/hooks/use-resolved-theme";
export interface MediaUnit {
  key: string;
  url: string;
  isVideo: boolean;
  posterUrl?: string;
  posterKey?: string;
  requiresGeneratedPreview?: boolean;
}

export interface MediaPickOptions {
  theme?: ResolvedTheme;
  tweetCover?: TweetCover;
}
