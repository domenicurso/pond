import { afterEach, expect, it, vi } from "vitest";
import { z } from "zod";
import type { InferenceRequest, InferenceResponse } from "./inference-protocol";
import {
  createInferenceTransport,
  type InferenceWorker,
} from "./inference-transport";

class WorkerFixture implements InferenceWorker {
  onmessage: InferenceWorker["onmessage"] = null;
  onerror: InferenceWorker["onerror"] = null;
  onmessageerror: InferenceWorker["onmessageerror"] = null;
  requests: InferenceRequest[] = [];
  terminated = false;
  postMessage(request: InferenceRequest): void {
    this.requests.push(request);
  }
  terminate(): void {
    this.terminated = true;
  }
  reply(response: InferenceResponse): void {
    this.onmessage?.(new MessageEvent("message", { data: response }));
  }
  crash(): void {
    this.onerror?.(new ErrorEvent("error", { message: "GPU lost" }));
  }
}

afterEach(() => vi.useRealTimers());

it("restarts after a crash, stops a repeated crash loop, and allows an explicit retry", async () => {
  const workers: WorkerFixture[] = [];
  const transport = createInferenceTransport(() => {
    const worker = new WorkerFixture();
    workers.push(worker);
    return worker;
  });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const pending = transport.call(
      z.string(),
      { op: "embedText", text: "hello" },
      [],
    );
    const rejection = expect(pending).rejects.toThrow("GPU lost");
    workers[attempt]?.crash();
    await rejection;
    expect(workers[attempt]?.terminated).toBe(true);
  }
  await expect(
    transport.call(z.string(), { op: "embedText", text: "hello" }, []),
  ).rejects.toThrow("stopped repeatedly");
  expect(workers).toHaveLength(2);
  transport.reset();
  const pending = transport.call(
    z.string(),
    { op: "embedText", text: "hello" },
    [],
  );
  workers[2]?.reply({ id: 3, ok: true, result: "ready" });
  await expect(pending).resolves.toBe("ready");
});

it("rejects invalid model output so the sweep can move to the next task", async () => {
  const worker = new WorkerFixture();
  const transport = createInferenceTransport(() => worker);
  const pending = transport.call(
    z.string(),
    { op: "embedText", text: "hello" },
    [],
  );
  worker.reply({ id: 1, ok: true, result: [1] });
  await expect(pending).rejects.toThrow("Invalid inference worker result");
  const next = transport.call(
    z.string(),
    { op: "embedText", text: "next" },
    [],
  );
  worker.reply({ id: 2, ok: true, result: "ready" });
  await expect(next).resolves.toBe("ready");
});

it("times out a silent worker and rejects all outstanding work", async () => {
  vi.useFakeTimers();
  const worker = new WorkerFixture();
  const transport = createInferenceTransport(() => worker, 1000);
  const pending = transport.call(
    z.string(),
    { op: "embedText", text: "hello" },
    [],
  );
  const rejection = expect(pending).rejects.toThrow("timed out");
  await vi.advanceTimersByTimeAsync(1000);
  await rejection;
  expect(worker.terminated).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

it("cleans up a request when posting fails", async () => {
  vi.useFakeTimers();
  class BrokenWorker extends WorkerFixture {
    override postMessage(): void {
      throw new DOMException("Cannot clone");
    }
  }
  const transport = createInferenceTransport(() => new BrokenWorker());
  await expect(
    transport.call(z.string(), { op: "embedText", text: "hello" }, []),
  ).rejects.toThrow("Cannot clone");
  expect(vi.getTimerCount()).toBe(0);
});
