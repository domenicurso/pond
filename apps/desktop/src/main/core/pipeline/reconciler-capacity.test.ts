import { expect, it } from "vitest";
import { canDispatchTask } from "./priority";
import {
  MAX_BACKGROUND_INFLIGHT,
  MAX_GLOBAL_INFLIGHT,
  MAX_INTERACTIVE_INFLIGHT,
  PER_OP_CONCURRENCY,
} from "./reconciler-config";

it("admits a fourth background download while retaining room for interactive work", () => {
  const active = 3;
  expect(
    canDispatchTask({
      interactive: false,
      paused: false,
      inflightGlobal: active,
      inflightInteractive: 0,
      inflightForOp: 0,
      opCap: PER_OP_CONCURRENCY.fetch_blobs,
      backgroundCap: MAX_BACKGROUND_INFLIGHT,
      interactiveCap: MAX_INTERACTIVE_INFLIGHT,
    }),
  ).toBe(true);
  expect(MAX_GLOBAL_INFLIGHT - MAX_BACKGROUND_INFLIGHT).toBeGreaterThan(0);
  expect(
    canDispatchTask({
      interactive: true,
      paused: false,
      inflightGlobal: MAX_BACKGROUND_INFLIGHT,
      inflightInteractive: 0,
      inflightForOp: PER_OP_CONCURRENCY.fetch_blobs,
      opCap: PER_OP_CONCURRENCY.fetch_blobs,
      backgroundCap: MAX_BACKGROUND_INFLIGHT,
      interactiveCap: MAX_INTERACTIVE_INFLIGHT,
    }),
  ).toBe(true);
});
