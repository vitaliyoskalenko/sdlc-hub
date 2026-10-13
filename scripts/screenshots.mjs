// Takes the README's screenshots from the static sample (docs/sample/index.html), so they show the same made-up
// project. Run `npm run sample` first, then `node scripts/screenshots.mjs`.

import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sample = pathToFileURL(join(root, "docs/sample/index.html")).href;
const out = join(root, "docs/screenshots");
mkdirSync(out, { recursive: true });

// name, page, person, and what to do on it first
const SHOTS = [
  ["home", "/", "maksym.d"],
  ["features", "/features", "maksym.d"],
  ["graph", "/features?view=graph", "maksym.d"],
  ["flow", "/features/bulk-order-export", "taras.m"],
  ["tasks", "/features/bulk-order-export/tasks", "petro.v"],
  ["documents", "/features/bulk-order-export/documents", "olena.k"],
  ["qa", "/features/tasks-issues/qa", "iryna.s"],
  ["release", "/features/staff-permissions/release", "bohdan.r"],
  ["costs", "/features/tasks-issues/costs", "maksym.d"],
  ["releases", "/releases", "bohdan.r"],
  ["team", "/people", "nazar.t"],
  ["settings", "/settings", "nazar.t"],
  ["guide", "/guide", "taras.m"],
  ["help", "/help", "maksym.d"],
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 820 }, deviceScaleFactor: 1, colorScheme: "light" });
for (const [name, path, as] of SHOTS) {
  await page.goto(`${sample}#${path}${path.includes("?") ? "&" : "?"}as=${as}`);
  await page.waitForFunction(() => !document.body.innerText.includes("Loading"));
  // The sample's "nothing is saved here" note is not part of the site.
  await page.addStyleTag({ content: "#hub-behind{display:none}" });
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(out, `${name}.png`) });
}
const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, colorScheme: "light" });
await phone.goto(`${sample}#/features/tasks-issues?as=iryna.s`);
await phone.addStyleTag({ content: "#hub-behind{display:none}" });
await phone.waitForTimeout(400);
await phone.screenshot({ path: join(out, "phone.png") });
await browser.close();
console.log(`Wrote ${SHOTS.length + 1} screenshots to docs/screenshots/`);
