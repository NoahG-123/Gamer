import { build } from "esbuild";
import fs from "node:fs";
fs.mkdirSync("dist/electron", { recursive: true });
await build({ entryPoints: ["electron/main.ts"], outfile: "dist/electron/main.js", bundle: true, platform: "node", target: "node22", format: "cjs", external: ["electron"], sourcemap: false, minify: false });
await build({ entryPoints: ["electron/preload.ts"], outfile: "dist/electron/preload.js", bundle: true, platform: "node", target: "node22", format: "cjs", external: ["electron"] });
console.log("electron bundled -> dist/electron");
