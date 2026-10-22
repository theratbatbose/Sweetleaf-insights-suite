// Sweetleaf Suite desktop app: runs the local Sweetleaf server inside the app and shows it in its own window.
import { app, BrowserWindow, dialog, shell } from "electron";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
process.env.SWEETLEAF_EMBEDDED = "1";

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let window = null;
  let server = null;

  const createWindow = async () => {
    window = new BrowserWindow({
      width: 1440,
      height: 920,
      minWidth: 960,
      minHeight: 640,
      title: "Sweetleaf Suite",
      backgroundColor: "#f5f1e8",
      icon: path.join(here, "icon.png"),
      autoHideMenuBar: true,
      show: false,
      webPreferences: { contextIsolation: true, sandbox: true },
    });
    window.once("ready-to-show", () => window.show());
    // Links to other websites (e.g. "Get a key") open in the normal browser.
    const isInternal = (url) => url.startsWith(server.url);
    window.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:/i.test(url) && !isInternal(url)) void shell.openExternal(url);
      return { action: "deny" };
    });
    window.webContents.on("will-navigate", (event, url) => {
      if (!isInternal(url)) {
        event.preventDefault();
        if (/^https?:/i.test(url)) void shell.openExternal(url);
      }
    });
    window.on("closed", () => { window = null; });
    await window.loadURL(server.url);
  };

  app.on("second-instance", () => {
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.focus();
  });

  app.whenReady().then(async () => {
    try {
      const { startServer } = await import(pathToFileURL(path.join(here, "build", "server.mjs")).href);
      server = await startServer({ port: 4317, embedded: true, openBrowserWindow: false });
    } catch (error) {
      dialog.showErrorBox("Sweetleaf could not start", String(error?.stack ?? error));
      app.quit();
      return;
    }
    await createWindow();
  });

  app.on("activate", () => { if (!window && server) void createWindow(); });
  app.on("window-all-closed", async () => {
    await server?.close();
    app.quit();
  });
}
