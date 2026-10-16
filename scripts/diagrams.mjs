// Draws every ```mermaid block of docs/guides/*.md as an SVG in docs/guides/diagrams/, named by a hash of its text,
// so the site shows the picture without carrying mermaid: the hub stays one file that works offline. GitHub and
// GitLab draw the blocks themselves. Run `npm run diagrams` after changing a diagram; a test fails while one is missing.

import { readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const guides = join(root, "docs/guides");
const out = join(guides, "diagrams");

/** FNV-1a over the block's text: the same key packages/web/src/diagrams.ts computes. */
export function diagramKey(text) {
  let h = 0x811c9dc5;
  for (const ch of text.trim()) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

const blocks = readdirSync(guides)
  .filter((f) => f.endsWith(".md"))
  .flatMap((f) => [...readFileSync(join(guides, f), "utf8").matchAll(/^```mermaid\n([\s\S]*?)^```$/gm)].map((m) => m[1]));
const wanted = new Map(blocks.map((b) => [diagramKey(b), b]));

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent("<!doctype html><body></body>");
await page.addScriptTag({ path: join(root, "node_modules/mermaid/dist/mermaid.min.js") });
await page.evaluate(() =>
  window.mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: "neutral",
    fontFamily: "Inter, system-ui, sans-serif",
    // Plain SVG text, no HTML inside the picture.
    htmlLabels: false,
    flowchart: { htmlLabels: false, curve: "basis" },
    sequence: { mirrorActors: false },
  }),
);
for (const [key, text] of wanted) {
  const svg = await page.evaluate(async ([id, t]) => (await window.mermaid.render(id, t)).svg, [`d${key}`, text.trim()]);
  writeFileSync(join(out, `${key}.svg`), svg);
}
await browser.close();
for (const f of readdirSync(out)) if (f.endsWith(".svg") && !wanted.has(f.slice(0, -4))) rmSync(join(out, f));
console.log(`Wrote ${wanted.size} diagrams to docs/guides/diagrams/`);
