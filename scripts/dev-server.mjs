import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const publicDir = path.join(rootDir, "public");
const port = Number(process.env.PORT || 4173);

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".stl": "model/stl",
  ".txt": "text/plain; charset=utf-8",
};

function resolvePaths(urlPath) {
  const safePath = decodeURIComponent(urlPath.split("?")[0]);
  const candidate = safePath === "/" ? "/index.html" : safePath;
  const filePath = path.normalize(path.join(rootDir, candidate));

  if (!filePath.startsWith(rootDir)) {
    return null;
  }

  if (candidate === "/index.html") {
    return [filePath];
  }

  const publicPath = path.normalize(path.join(publicDir, candidate));
  return [filePath, publicPath];
}

const server = http.createServer(async (request, response) => {
  const filePaths = resolvePaths(request.url || "/");

  if (!filePaths) {
    response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Forbidden");
    return;
  }

  for (const filePath of filePaths) {
    try {
      const stats = await fs.stat(filePath);
      const finalPath = stats.isDirectory() ? path.join(filePath, "index.html") : filePath;
      const file = await fs.readFile(finalPath);
      const extension = path.extname(finalPath);

      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Type": mimeTypes[extension] || "application/octet-stream",
      });
      response.end(file);
      return;
    } catch (error) {
      if (error?.code !== "ENOENT") {
        response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Unable to read local asset");
        return;
      }
    }
  }

  response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  response.end("Not found");
});

server.listen(port, () => {
  console.log(`Robotics Sandbox available at http://127.0.0.1:${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
