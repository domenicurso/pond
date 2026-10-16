const { app, BrowserWindow, session } = require("electron");
const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync, readdirSync, rmSync } = require("node:fs");
const { stripTypeScriptTypes } = require("node:module");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { pathToFileURL } = require("node:url");

const withModel = process.argv.includes("--model");
const sandbox = mkdtempSync(join(tmpdir(), "pond-inference-smoke-"));
app.setPath("userData", sandbox);
process.once("exit", () => rmSync(sandbox, { recursive: true, force: true }));
const deadline = setTimeout(
  () => {
    console.error("INFERENCE_SMOKE_FAILED: worker did not respond");
    app.exit(1);
  },
  withModel ? 180_000 : 30_000,
);

async function configureReleaseHeaders() {
  const source = readFileSync(
    resolve(__dirname, "../src/main/session-response-headers.ts"),
    "utf8",
  );
  const code = stripTypeScriptTypes(source);
  const { rendererResponseHeaders } = await import(
    `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
  );
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: rendererResponseHeaders(
        details.url,
        details.responseHeaders,
      ),
    });
  });
}

async function runWorker(window) {
  const assets = resolve(__dirname, "../out/renderer/assets");
  const workerFile = readdirSync(assets).find((file) =>
    /^inference-worker-.*\.js$/.test(file),
  );
  assert.ok(workerFile, "Build the desktop before running this check");
  const workerUrl = pathToFileURL(join(assets, workerFile)).href;
  const result =
    await window.webContents.executeJavaScript(`new Promise((resolve, reject) => {
    const worker = new Worker(${JSON.stringify(workerUrl)}, { type: "module" });
    worker.onerror = event => { worker.terminate(); reject(new Error(event.message || "Worker failed to start under release headers")); };
    worker.onmessage = event => { worker.terminate(); resolve(event.data); };
    worker.postMessage(${
      withModel
        ? `{ id: 1, op: "florence", task: "<CAPTION>", image: { data: new Uint8ClampedArray(32 * 32 * 3).fill(127).buffer, width: 32, height: 32, channels: 3 } }`
        : `{ id: 1, op: "embedTexts", texts: [] }`
    });
  })`);
  assert.equal(result.ok, true, result.error);
  if (withModel) {
    assert.match(result.result, /\S/, "Caption must contain text");
  } else assert.deepEqual(result.result, []);
  return result;
}

app
  .whenReady()
  .then(async () => {
    await configureReleaseHeaders();
    const window = new BrowserWindow({
      show: false,
      webPreferences: { sandbox: true },
    });
    await window.loadFile(resolve(__dirname, "../out/renderer/capture.html"));
    const result = await runWorker(window);
    console.log("INFERENCE_SMOKE_PASSED", JSON.stringify(result));
    clearTimeout(deadline);
    window.destroy();
    app.exit(0);
  })
  .catch((error) => {
    clearTimeout(deadline);
    console.error("INFERENCE_SMOKE_FAILED", error);
    app.exit(1);
  });
