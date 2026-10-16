import type { z } from "zod";
import type {
  InferenceRequest,
  InferenceResponse,
  InferenceResult,
} from "./inference-protocol";
import type { RequestBody } from "./inference-requests";

export interface InferenceWorker {
  onmessage: ((event: MessageEvent<InferenceResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  postMessage(request: InferenceRequest, transfer: Transferable[]): void;
  terminate(): void;
}
interface PendingInference {
  resolve(value: InferenceResult): void;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout>;
}

class InferenceTransport {
  private worker: InferenceWorker | null = null;
  private crashes = 0;
  private nextId = 1;
  private readonly pending = new Map<number, PendingInference>();

  constructor(
    private readonly createWorker: () => InferenceWorker,
    private readonly timeoutMs: number,
  ) {}

  reset(): void {
    this.crashes = 0;
  }

  private fail(error: Error): void {
    const current = this.worker;
    this.worker = null;
    if (current) {
      current.onmessage = null;
      current.onerror = null;
      current.onmessageerror = null;
      current.terminate();
    }
    this.crashes += 1;
    for (const job of this.pending.values()) {
      clearTimeout(job.timer);
      job.reject(error);
    }
    this.pending.clear();
  }

  private receive(event: MessageEvent<InferenceResponse>): void {
    const message = event.data;
    const job = this.pending.get(message.id);
    if (!job) return;
    this.pending.delete(message.id);
    clearTimeout(job.timer);
    if (message.ok) job.resolve(message.result);
    else job.reject(new Error(message.error));
  }

  private ensureWorker(): InferenceWorker {
    if (this.worker) return this.worker;
    if (this.crashes > 1)
      throw new Error(
        "Inference worker stopped repeatedly. Check the library to retry processing.",
      );
    this.worker = this.createWorker();
    this.worker.onmessage = (event) => this.receive(event);
    this.worker.onerror = (event) =>
      this.fail(new Error(`Inference worker crashed: ${event.message}`));
    this.worker.onmessageerror = () =>
      this.fail(new Error("Couldn't read the inference worker response"));
    return this.worker;
  }

  async call<T extends InferenceResult>(
    schema: z.ZodType<T>,
    message: RequestBody,
    transfer: Transferable[],
  ): Promise<T> {
    const current = this.ensureWorker();
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(
        () =>
          this.fail(
            new Error(
              "Inference worker timed out. Check the library to retry processing.",
            ),
          ),
        this.timeoutMs,
      );
      this.pending.set(id, {
        timer,
        reject,
        resolve(value) {
          const parsed = schema.safeParse(value);
          if (parsed.success) resolve(parsed.data);
          else
            reject(
              new Error("Invalid inference worker result", {
                cause: parsed.error,
              }),
            );
        },
      });
      try {
        current.postMessage({ id, ...message }, transfer);
      } catch (error) {
        this.pending.delete(id);
        clearTimeout(timer);
        reject(error);
      }
    });
  }
}

export function createInferenceTransport(
  createWorker: () => InferenceWorker,
  timeoutMs = 10 * 60_000,
) {
  return new InferenceTransport(createWorker, timeoutMs);
}
