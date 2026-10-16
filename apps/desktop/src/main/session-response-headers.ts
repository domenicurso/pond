const PROD_CSP = [
  "default-src 'self' pond:",
  "img-src 'self' data: blob: pond: https:",
  "media-src 'self' data: blob: pond: https:",
  "style-src 'self' 'unsafe-inline'",
  /** onnxruntime-web needs wasm-unsafe-eval and blob: for its wasm module/worker. */
  "script-src 'self' 'wasm-unsafe-eval' blob:",
  "worker-src 'self' blob:",
  "connect-src 'self' blob: http://127.0.0.1:* pond: https:",
  "font-src 'self' data: pond:",
  "frame-src pond: https://www.youtube-nocookie.com",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
].join("; ");

type ResponseHeaders = Record<string, string | string[]>;

export function rendererResponseHeaders(
  url: string,
  original: ResponseHeaders | undefined,
): ResponseHeaders | undefined {
  // Replay owns its CSP and embedder policy independently of the app document.
  if (url.startsWith("pond://")) return original;
  const headers = { ...original };
  for (const key of Object.keys(headers)) {
    const name = key.toLowerCase();
    if (
      name === "content-security-policy" ||
      name === "cross-origin-opener-policy" ||
      name === "cross-origin-embedder-policy"
    )
      delete headers[key];
  }
  headers["Content-Security-Policy"] = [PROD_CSP];
  // Chromium does not isolate file: documents, and COEP on their worker responses prevents startup.
  // Keep isolation for HTTP origins; packaged file: inference uses the supported single-thread WASM path.
  if (!url.startsWith("file:")) {
    headers["Cross-Origin-Opener-Policy"] = ["same-origin"];
    headers["Cross-Origin-Embedder-Policy"] = ["credentialless"];
  }
  return headers;
}
