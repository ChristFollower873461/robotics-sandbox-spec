import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import sharp from "sharp";

test("every locked Sharp copy meets the GHSA-rgj7-g3m4-5g8c security floor", () => {
  const lock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));
  const copies = Object.entries(lock.packages).filter(([path]) => /(^|\/)node_modules\/sharp$/.test(path));
  assert.ok(copies.length > 0, "the image toolchain must have a locked Sharp copy");

  for (const [path, { version }] of copies) {
    assert.match(version, /^\d+\.\d+\.\d+$/, `${path} must use a stable release`);
    const [major, minor, patch] = version.split(".").map(Number);
    assert.ok(
      major > 0 || (minor > 35 || (minor === 35 && patch >= 4)),
      `${path}@${version} is below the patched 0.35.4 release`,
    );
  }
});

test("the image toolchain converts a repository-style SVG without changing files", async () => {
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="2" height="3"><rect width="2" height="3" fill="#ff0000"/></svg>');
  const png = await sharp(svg).png().toBuffer();
  const metadata = await sharp(png).metadata();
  assert.equal(metadata.format, "png");
  assert.equal(metadata.width, 2);
  assert.equal(metadata.height, 3);

  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.channels, 4);
  assert.deepEqual([...data], Array.from({ length: 6 }, () => [255, 0, 0, 255]).flat());
});

test("the image toolchain rejects non-image input", async () => {
  await assert.rejects(
    sharp(Buffer.from("This is ordinary text, not an image.")).metadata(),
    /unsupported image format/i,
  );
});
