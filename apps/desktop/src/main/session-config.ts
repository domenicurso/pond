import { app, session } from "electron";
import log from "electron-log/main.js";
import { rendererResponseHeaders } from "./session-response-headers";

export function configureSessionDefaults(): void {
  const denyAll: Parameters<
    Electron.Session["setPermissionRequestHandler"]
  >[0] = (_wc, _permission, callback) => callback(false);
  session.defaultSession.setPermissionRequestHandler(denyAll);
  session.defaultSession.setPermissionCheckHandler(() => false);
  try {
    session
      .fromPartition("persist:pond-scrapers")
      .setPermissionRequestHandler(denyAll);
  } catch (err) {
    log.warn("[pond] scrapers session permission handler failed", err);
  }

  if (app.isPackaged) {
    session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
      cb({
        responseHeaders: rendererResponseHeaders(
          details.url,
          details.responseHeaders,
        ),
      });
    });
  }
}
