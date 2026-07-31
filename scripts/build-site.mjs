import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(rootDir, "dist");
const clientDir = path.join(distDir, "client");
const serverDir = path.join(distDir, "server");
const metadataDir = path.join(distDir, ".openai");

await fs.rm(distDir, { recursive: true, force: true });
await Promise.all([
  fs.mkdir(clientDir, { recursive: true }),
  fs.mkdir(serverDir, { recursive: true }),
  fs.mkdir(metadataDir, { recursive: true }),
]);

await Promise.all([
  fs.copyFile(path.join(rootDir, "index.html"), path.join(clientDir, "index.html")),
  fs.copyFile(path.join(rootDir, "styles.css"), path.join(clientDir, "styles.css")),
  fs.cp(path.join(rootDir, "src"), path.join(clientDir, "src"), { recursive: true }),
  fs.copyFile(path.join(rootDir, "worker", "index.js"), path.join(serverDir, "index.js")),
  fs.copyFile(path.join(rootDir, "worker", "wrangler.json"), path.join(serverDir, "wrangler.json")),
  fs.copyFile(path.join(rootDir, ".openai", "hosting.json"), path.join(metadataDir, "hosting.json")),
]);

console.log("Built Robotics Sandbox for web deployment in dist/.");
