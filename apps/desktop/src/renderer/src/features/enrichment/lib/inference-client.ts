import type { RawImage } from "@huggingface/transformers";
import { z } from "zod";
import type { FlorenceTask } from "./inference-core";
import {
  createAudioEmbeddingRequest,
  createVideoEmbeddingRequest,
  serializeImage,
  type VideoEmbeddingFrame,
} from "./inference-requests";
import { createInferenceTransport } from "./inference-transport";

export type { VideoEmbeddingFrame } from "./inference-requests";
export {
  createAudioEmbeddingRequest,
  createVideoEmbeddingRequest,
  MAX_EMBEDDING_AUDIO_SAMPLES,
  MAX_EMBEDDING_VIDEO_DURATION_SECONDS,
  MAX_EMBEDDING_VIDEO_FRAMES,
} from "./inference-requests";

const transport = createInferenceTransport(
  () =>
    new Worker(new URL("./inference-worker.ts", import.meta.url), {
      type: "module",
    }),
);
export function resetInferenceWorker(): void {
  transport.reset();
}
const TextSchema = z.string();
const LabelsSchema = z.array(TextSchema);
const ScoresSchema = z.array(z.number());
const VectorSchema = z.instanceof(Float32Array);
const VectorsSchema = z.array(VectorSchema);

export function inferFlorence(
  image: RawImage,
  task: FlorenceTask,
): Promise<string> {
  const img = serializeImage(image);
  return transport.call(TextSchema, { op: "florence", image: img, task }, [
    img.data,
  ]);
}
export function inferClipImage(image: RawImage): Promise<Float32Array> {
  const img = serializeImage(image);
  return transport.call(VectorSchema, { op: "clipImage", image: img }, [
    img.data,
  ]);
}
export function inferClipAesthetic(
  image: RawImage,
  labels: string[],
): Promise<string[]> {
  const img = serializeImage(image);
  return transport.call(
    LabelsSchema,
    { op: "clipAesthetic", image: img, labels },
    [img.data],
  );
}
export function inferSensitiveContent(images: RawImage[]): Promise<number[]> {
  const serialized = images.map(serializeImage);
  return transport.call(
    ScoresSchema,
    { op: "sensitiveContent", images: serialized },
    serialized.map((image) => image.data),
  );
}
export function inferEmbedText(text: string): Promise<Float32Array> {
  return transport.call(VectorSchema, { op: "embedText", text }, []);
}
export function inferEmbedTexts(texts: string[]): Promise<Float32Array[]> {
  return transport.call(VectorsSchema, { op: "embedTexts", texts }, []);
}
export function inferEmbedAudio(audio: Float32Array): Promise<Float32Array> {
  const prepared = createAudioEmbeddingRequest(audio);
  return transport.call(VectorSchema, prepared.request, prepared.transfer);
}
export function inferEmbedVideoFrames(
  frames: VideoEmbeddingFrame[],
  duration: number,
): Promise<Float32Array> {
  const prepared = createVideoEmbeddingRequest(frames, duration);
  return transport.call(VectorSchema, prepared.request, prepared.transfer);
}
export function inferTranscribe(audio: Float32Array): Promise<string> {
  const copy = audio.slice();
  return transport.call(TextSchema, { op: "transcribe", audio: copy }, [
    copy.buffer,
  ]);
}
