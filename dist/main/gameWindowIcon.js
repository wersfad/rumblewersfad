import { app } from "electron";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { brandingReport } from "./brandingReport.js";
function applyLauncherIcon(pid, gameFolder) {
  try { const options = JSON.parse(fs.readFileSync(path.join(process.resourcesPath, 'branding-settings.json'),'utf8')); if (options.gameWindowBranding === false) return; } catch {}
    const report = path.join(app.getPath("userData"), "game-branding.txt");
  let fd;
  const note = (text) => {
    try {
      fs.appendFileSync(report, (/* @__PURE__ */ new Date()).toISOString() + " JS " + text + "\n");
    } catch {
    }
  };
  try {
    fs.mkdirSync(app.getPath("userData"), { recursive: true });
    fs.writeFileSync(report, "Game branding 1.2.0; PID=" + pid + "\n");
    brandingReport("Game branding requested; report=" + report);
    if (process.platform !== "win32" || !Number.isSafeInteger(pid) || pid <= 0) {
      note("Unsupported platform or PID");
      return;
    }
    const resources = app.isPackaged ? process.resourcesPath : path.join(app.getAppPath(), "assets");
    const helperPath = path.join(resources, "game-window-icon.exe");
    const iconPath = path.join(resources, app.isPackaged ? "game-window-icon.ico" : "icon.ico");
    note("helper=" + helperPath + "; exists=" + fs.existsSync(helperPath));
    note("icon=" + iconPath + "; exists=" + fs.existsSync(iconPath));
    if (!fs.existsSync(helperPath) || !fs.existsSync(iconPath)) return;
    fd = fs.openSync(report, "a");
    const helper = spawn(helperPath, [String(pid), iconPath, path.resolve(gameFolder), report, process.execPath], {
      shell: false,
      detached: true,
      windowsHide: true,
      stdio: ["ignore", fd, fd]
    });
    helper.once("spawn", () => note("Helper process started; PID=" + helper.pid));
    helper.once("error", (error) => note("Helper error: " + error.message));
    helper.once("exit", (code, signal) => note("Helper exited; code=" + code + "; signal=" + signal));
    helper.unref();
  } catch (error) {
    note("Bridge error: " + String(error));
  } finally {
    if (fd !== void 0) {
      try {
        fs.closeSync(fd);
      } catch {
      }
    }
  }
}
export {
  applyLauncherIcon
};
