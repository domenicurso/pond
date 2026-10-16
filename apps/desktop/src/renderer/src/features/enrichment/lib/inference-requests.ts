import type { RawImage } from "@huggingface/transformers";
import type {
  InferenceRequest,
  SerializedImage,
  SerializedVideoFrame,
} from "./inference-protocol";
export function serializeImage(image: RawImage): SerializedImage {
  const copy = new Uint8ClampedArray(image.data);
  return {
    data: copy.buffer,
    width: image.width,
    height: image.height,
    channels: image.channels,
  };
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;
export type RequestBody = DistributiveOmit<InferenceRequest, "id">;

const EMBEDDING_AUDIO_SAMPLE_RATE = 16_000;
const MAX_EMBEDDING_AUDIO_SECONDS = 30;
export const MAX_EMBEDDING_AUDIO_SAMPLES =
  EMBEDDING_AUDIO_SAMPLE_RATE * MAX_EMBEDDING_AUDIO_SECONDS;
export const MAX_EMBEDDING_VIDEO_FRAMES = 32;
export const MAX_EMBEDDING_VIDEO_DURATION_SECONDS = 32;

export interface VideoEmbeddingFrame {
  image: RawImage;
  timestamp: number;
}

interface PreparedRequest<T extends RequestBody> {
  request: T;
  transfer: Transferable[];
}

export function createAudioEmbeddingRequest(
  audio: Float32Array,
): PreparedRequest<{ op: "embedAudio"; audio: Float32Array }> {
  if (
    audio.length === 0 ||
    audio.length > MAX_EMBEDDING_AUDIO_SAMPLES ||
    !audio.every(Number.isFinite)
  ) {
    throw new Error(
      `audio must contain 1-${MAX_EMBEDDING_AUDIO_SAMPLES} finite mono 16 kHz samples`,
    );
  }
  const copy = audio.slice();
  return {
    request: { op: "embedAudio", audio: copy },
    transfer: [copy.buffer],
  };
}

export function createVideoEmbeddingRequest(
  frames: VideoEmbeddingFrame[],
  duration: number,
): PreparedRequest<{
  op: "embedVideoFrames";
  frames: SerializedVideoFrame[];
  duration: number;
}> {
  if (frames.length === 0 || frames.length > MAX_EMBEDDING_VIDEO_FRAMES) {
    throw new Error(
      `video must contain 1-${MAX_EMBEDDING_VIDEO_FRAMES} frames`,
    );
  }
  if (
    !Number.isFinite(duration) ||
    duration <= 0 ||
    duration > MAX_EMBEDDING_VIDEO_DURATION_SECONDS
  ) {
    throw new Error(
      `video duration must be greater than 0 and at most ${MAX_EMBEDDING_VIDEO_DURATION_SECONDS} seconds`,
    );
  }

  let previousTimestamp = -1;
  for (const frame of frames) {
    if (
      !Number.isFinite(frame.timestamp) ||
      frame.timestamp < 0 ||
      frame.timestamp > duration ||
      frame.timestamp < previousTimestamp
    ) {
      throw new Error(
        "video frame timestamps must be finite, ordered, and within duration",
      );
    }
    previousTimestamp = frame.timestamp;
  }

  const serialized = frames.map((frame) => ({
    image: serializeImage(frame.image),
    timestamp: frame.timestamp,
  }));
  return {
    request: { op: "embedVideoFrames", frames: serialized, duration },
    transfer: serialized.map((frame) => frame.image.data),
  };
}
