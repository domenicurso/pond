import { expect, it } from "vitest";
import { rendererResponseHeaders } from "./session-response-headers";

it("keeps the CSP while allowing packaged file workers to start", () => {
  const original = {
    "content-security-policy": "old",
    "cross-origin-embedder-policy": "require-corp",
    "Cross-Origin-Opener-Policy": "same-origin",
    "X-Custom": "preserved",
  };
  const headers = rendererResponseHeaders(
    "file:///app/renderer/assets/inference-worker.js",
    original,
  );
  expect(headers?.["Content-Security-Policy"]).toEqual([
    expect.stringContaining("worker-src 'self' blob:"),
  ]);
  expect(headers?.["Cross-Origin-Embedder-Policy"]).toBeUndefined();
  expect(headers?.["cross-origin-embedder-policy"]).toBeUndefined();
  expect(headers?.["Cross-Origin-Opener-Policy"]).toBeUndefined();
  expect(headers?.["X-Custom"]).toBe("preserved");
  expect(original["content-security-policy"]).toBe("old");
});

it("retains isolation on HTTP origins and leaves replay headers untouched", () => {
  const headers = rendererResponseHeaders(
    "https://example.com/resource",
    undefined,
  );
  expect(headers?.["Cross-Origin-Opener-Policy"]).toEqual(["same-origin"]);
  expect(headers?.["Cross-Origin-Embedder-Policy"]).toEqual(["credentialless"]);
  const replay = { "Content-Security-Policy": "replay" };
  expect(rendererResponseHeaders("pond://_replay/index.html", replay)).toBe(
    replay,
  );
});
