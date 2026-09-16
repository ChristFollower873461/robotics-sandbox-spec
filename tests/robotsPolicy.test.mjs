import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("robots permits public search and retrieval but denies dedicated training", () => {
  const trainingTokens = [
    "GPTBot", "ClaudeBot", "CCBot", "Bytespider", "Google-Extended",
    "Applebot-Extended", "Amazonbot", "meta-externalagent",
  ];
  // Pin the complete static policy so no extra group can override public access
  // and no sitemap is advertised for an endpoint this workbench does not publish.
  const expected = [
    "User-agent: *\nAllow: /\nContent-Signal: search=yes,ai-input=yes,ai-train=no",
    ...trainingTokens.map((token) => `User-agent: ${token}\nDisallow: /`),
  ].join("\n\n") + "\n";

  assert.equal(readFileSync(new URL("../public/robots.txt", import.meta.url), "utf8"), expected);
});
