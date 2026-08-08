import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(rootDir, "dist");
const clientDir = path.join(distDir, "client");
const serverDir = path.join(distDir, "server");
const publicDir = path.join(rootDir, "public");

await fs.rm(distDir, { recursive: true, force: true });
await Promise.all([
  fs.mkdir(clientDir, { recursive: true }),
  fs.mkdir(serverDir, { recursive: true }),
]);

await Promise.all([
  fs.copyFile(path.join(rootDir, "index.html"), path.join(clientDir, "index.html")),
  fs.copyFile(path.join(rootDir, "styles.css"), path.join(clientDir, "styles.css")),
  fs.copyFile(path.join(rootDir, "range.css"), path.join(clientDir, "range.css")),
  fs.cp(publicDir, clientDir, { recursive: true }),
  fs.cp(path.join(rootDir, "src"), path.join(clientDir, "src"), { recursive: true }),
  fs.copyFile(path.join(rootDir, "worker", "index.js"), path.join(serverDir, "index.js")),
  fs.copyFile(path.join(rootDir, "worker", "wrangler.json"), path.join(serverDir, "wrangler.json")),
]);

// The test range includes Three.js plus audited STL, GLB, and URDF loaders. Bundle only this entry so
// the rest of the dependency-free application keeps its existing native-module
// delivery, while the browser never has to resolve packages from node_modules.
await build({
  entryPoints: [path.join(rootDir, "src", "ui", "testRangeApp.js")],
  outfile: path.join(clientDir, "src", "ui", "testRangeApp.js"),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["es2022"],
  minify: true,
  legalComments: "eof",
});

console.log("Built Robotics Sandbox for Cloudflare in dist/.");
