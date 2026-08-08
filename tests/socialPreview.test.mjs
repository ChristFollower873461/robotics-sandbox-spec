import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

const htmlUrl = new URL("../index.html", import.meta.url);
const cardUrl = new URL("../public/robot-field-guide-social.png", import.meta.url);

test("social preview metadata is complete and points at production assets", async () => {
  const html = await readFile(htmlUrl, "utf8");

  assert.match(html, /<link rel="canonical" href="https:\/\/robotics\.basementboys\.org\/" \/>/);
  assert.match(html, /<link rel="icon" href="\/favicon\.svg" type="image\/svg\+xml" \/>/);
  assert.match(html, /<link rel="apple-touch-icon" href="\/apple-touch-icon\.png" \/>/);
  assert.match(html, /property="og:type" content="website"/);
  assert.match(html, /property="og:site_name" content="Basement Boys \/ Robot Field Guide"/);
  assert.match(html, /property="og:url" content="https:\/\/robotics\.basementboys\.org\/"/);
  assert.match(html, /property="og:image" content="https:\/\/robotics\.basementboys\.org\/robot-field-guide-social\.png"/);
  assert.match(html, /property="og:image:type" content="image\/png"/);
  assert.match(html, /property="og:image:width" content="1200"/);
  assert.match(html, /property="og:image:height" content="630"/);
  assert.match(html, /property="og:image:alt"/);
  assert.match(html, /name="twitter:card" content="summary_large_image"/);
  assert.match(html, /name="twitter:image" content="https:\/\/robotics\.basementboys\.org\/robot-field-guide-social\.png"/);
  assert.match(html, /name="twitter:image:alt"/);
});

test("social card is a valid 1200x630 PNG below the share-service size budget", async () => {
  const [png, cardStat] = await Promise.all([readFile(cardUrl), stat(cardUrl)]);

  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(png.readUInt32BE(16), 1200);
  assert.equal(png.readUInt32BE(20), 630);
  assert.ok(cardStat.size < 1_000_000, `expected card under 1 MB; got ${cardStat.size} bytes`);
});

test("Cloudflare build copies the public share assets", async () => {
  const [buildScript, devServer] = await Promise.all([
    readFile(new URL("../scripts/build-cloudflare.mjs", import.meta.url), "utf8"),
    readFile(new URL("../scripts/dev-server.mjs", import.meta.url), "utf8"),
  ]);

  assert.match(buildScript, /fs\.cp\(publicDir, clientDir, \{ recursive: true \}\)/);
  assert.match(devServer, /const publicDir = path\.join\(rootDir, "public"\)/);
  assert.match(devServer, /return \[filePath, publicPath\]/);
  assert.match(devServer, /"\.png": "image\/png"/);
});
