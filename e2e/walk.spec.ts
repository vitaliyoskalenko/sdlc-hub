// Walks the demo site as every person, on every page, tab and command help dialog, at a desktop and a phone
// width: no script errors, and no sideways scroll of the page (prototypes/hub/test_walk.py does the same).

import { expect, test, type Page } from "@playwright/test";

const PEOPLE = ["olena.k", "maksym.d", "daria.l", "taras.m", "petro.v", "andrii.p", "sofiia.h", "iryna.s", "bohdan.r", "nazar.t"];
const FEATURES = ["tasks-issues", "bulk-order-export", "returns-portal", "order-notes-fix", "staff-permissions", "order-webhooks"];
const VIEWPORTS = [
  { name: "desktop", width: 1366, height: 820 },
  { name: "phone", width: 390, height: 800 },
];

const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

async function ready(page: Page) {
  await page.waitForSelector("#main", { state: "attached" });
  await page.waitForFunction(() => !document.body.innerText.includes("Loading"));
}

for (const vp of VIEWPORTS) {
  test(`every role and page at ${vp.name} width`, async ({ browser }) => {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text()}`));
    const bad: string[] = [];
    const check = async (where: string) => {
      const o = await overflow(page);
      if (o > 0) bad.push(`${where}: ${o}px sideways`);
    };
    let dialogs = 0;
    const openHelp = async (where: string) => {
      const n = await page.locator("#main [data-info]").count();
      for (let k = 0; k < n; k++) {
        await page.locator("#main [data-info]").nth(k).click();
        await expect(page.locator("#dlg .dlg")).toBeVisible();
        dialogs++;
        const inner = await page.evaluate(() => {
          const d = document.querySelector(".dlg")!;
          return d.scrollWidth - d.clientWidth;
        });
        if (inner > 1) bad.push(`${where} help ${k}: dialog scrolls sideways`);
        await check(`${where} help ${k}`);
        await page.keyboard.press("Escape");
        await expect(page.locator("#dlg")).toHaveCount(0);
      }
    };

    for (const person of PEOPLE) {
      await page.goto(`/?as=${person}`);
      await ready(page);
      await expect(page.locator("h1")).toHaveText("Home");
      await check(`${person} home`);

      await page.click("#guidebtn");
      await expect(page.locator("h1")).toHaveText("Your guide");
      await check(`${person} guide`);
      await openHelp(`${person} guide`);

      await page.click('.nb[data-page="features"]');
      await expect(page.locator("h1")).toHaveText("Features");
      await check(`${person} features`);
      await page.click('[data-fview="graph"]');
      await expect(page.locator("svg.fgraph")).toBeVisible();
      for (const f of ["mine", "progress", "released", "all"]) {
        await page.click(`[data-ffilter="${f}"]`);
        await check(`${person} graph ${f}`);
      }
      await page.click('[data-fview="list"]');

      for (const slug of FEATURES) {
        await page.goto(`/features/${slug}?as=${person}`);
        await ready(page);
        await expect(page.locator("svg.flow")).toBeVisible();
        await check(`${person} ${slug} flow`);
        // Every step of the map opens its panel.
        const steps = await page.locator("svg.flow [data-step]").count();
        expect(steps).toBe(20);
        for (const k of [0, 4, 11, 16]) {
          await page.locator("svg.flow [data-step]").nth(k).click();
          await expect(page.locator("#steppanel h3")).toBeVisible();
        }
        await openHelp(`${person} ${slug} flow`);

        await page.click('.tab[data-ftab="documents"]');
        const docs = await page.locator("[data-doc]").count();
        for (let k = 0; k < docs; k++) {
          await page.locator("[data-doc]").nth(k).click();
          await page.waitForFunction(() => !document.querySelector("#main")!.textContent!.includes("Loading…"));
          await check(`${person} ${slug} doc ${k}`);
        }

        await page.click('.tab[data-ftab="tasks"]');
        await check(`${person} ${slug} tasks`);
        const teams = await page.locator("[data-team]").count();
        for (let k = 0; k < teams; k++) {
          await page.locator("[data-team]").nth(k).click();
          await check(`${person} ${slug} tasks team ${k}`);
        }
      }
    }
    console.log(`${vp.name}: ${PEOPLE.length} people, ${dialogs} help dialogs, ${errors.length} errors, ${bad.length} overflows`);
    expect(errors, errors.slice(0, 5).join("\n")).toEqual([]);
    expect(bad, bad.slice(0, 12).join("\n")).toEqual([]);
    await page.close();
  });
}

test("the page shows what the files say", async ({ page }) => {
  await page.goto("/features/tasks-issues?as=iryna.s");
  await ready(page);
  await expect(page.locator(".now")).toContainText("step 16 of 20 · verify");
  await expect(page.locator(".now")).toContainText("Returned");
  await expect(page.locator(".now")).toContainText("Your move");
  await page.goto("/features/order-webhooks?as=taras.m");
  await ready(page);
  await expect(page.locator('svg.flow [data-step="ux-flows"]')).toHaveClass(/st-skipped/);
  await expect(page.locator('svg.flow [data-step="screens"]')).toHaveClass(/st-skipped/);
  await page.goto("/features/bulk-order-export/tasks?as=maksym.d");
  await ready(page);
  await expect(page.locator(".note.bad")).toContainText("wait for another team");
  await expect(page.locator(".srcnote")).toContainText("Android from your local copy");
});

test("another site cannot use the server", async ({ request }) => {
  const r = await request.get("/api/features", { headers: { origin: "https://evil.example" } });
  expect(r.status()).toBe(403);
});
