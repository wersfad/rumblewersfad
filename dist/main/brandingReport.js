import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
const brandingReportPath = () => path.join(app.getPath("userData"), "branding-startup.txt");
function brandingReport(message, reset = false) {
  try {
    fs.mkdirSync(app.getPath("userData"), { recursive: true });
    const line = (/* @__PURE__ */ new Date()).toISOString() + " " + message + "\n";
    if (reset) fs.writeFileSync(brandingReportPath(), line, "utf8");
    else fs.appendFileSync(brandingReportPath(), line, "utf8");
  } catch {
  }
}
export {
  brandingReport,
  brandingReportPath
};
