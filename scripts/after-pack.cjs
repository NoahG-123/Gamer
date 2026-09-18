// electron-builder drops node_modules from extraResources, so the Next.js standalone
// server (which needs its own node_modules) is copied into resources/web here instead.
const fs = require("node:fs");
const path = require("node:path");
module.exports = async function afterPack(context) {
  const root = path.resolve(__dirname, "..");
  const resources = context.packager.platform.name === "mac"
    ? path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, "Contents", "Resources")
    : path.join(context.appOutDir, "resources");
  const dest = path.join(resources, "web");
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(path.join(root, "web", ".next", "standalone"), dest, { recursive: true, dereference: true });
  fs.cpSync(path.join(root, "web", ".next", "static"), path.join(dest, "web", ".next", "static"), { recursive: true });
  fs.cpSync(path.join(root, "web", "public"), path.join(dest, "web", "public"), { recursive: true });
  fs.rmSync(path.join(dest, "content"), { recursive: true, force: true }); // served from resources/content instead
  console.log("  • copied Next.js standalone server ->", dest);
};
