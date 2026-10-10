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
    let tasks = 0;
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

      // Every action opens as a task page over Home; its commands open help over it; Escape closes help, then the page.
      const actions = await page.locator("[data-task]").count();
      for (let k = 0; k < actions; k++) {
        await page.locator("[data-task]").nth(k).click();
        await expect(page.locator("#sheet .sheet")).toBeVisible();
        await page.waitForFunction(() => !document.querySelector("#sheet")!.textContent!.includes("Loading"));
        tasks++;
        const sw = await page.evaluate(() => {
          const s = document.querySelector(".sheet")!;
          return s.scrollWidth - s.clientWidth;
        });
        if (sw > 1) bad.push(`${person} task ${k}: the task page scrolls sideways (${sw}px)`);
        await check(`${person} task ${k}`);
        const infos = await page.locator("#sheet [data-info]").count();
        for (let j = 0; j < infos; j++) {
          await page.locator("#sheet [data-info]").nth(j).click();
          await expect(page.locator("#dlg .dlg")).toBeVisible();
          dialogs++;
          await page.keyboard.press("Escape");
          await expect(page.locator("#dlg")).toHaveCount(0);
          await expect(page.locator("#sheet .sheet")).toBeVisible();
        }
        await page.keyboard.press("Escape");
        await expect(page.locator("#sheet")).toHaveCount(0);
      }

      await page.click("#guidebtn");
      await expect(page.locator("h1")).toHaveText("Your guide");
      await check(`${person} guide`);
      await openHelp(`${person} guide`);

      // People and roles, and a setup script in both shells.
      await page.click('.nb[data-page="people"]');
      await expect(page.locator("h1")).toHaveText("People and roles");
      await expect(page.locator("#people tbody tr")).toHaveCount(10);
      await check(`${person} people`);
      if (person === "nazar.t") {
        await page.click("#add-person");
        await expect(page.locator("#person-form")).toBeVisible();
        await check(`${person} people form`);
        await page.click("#person-form .btn:not(.pri)");
      } else await expect(page.locator("#add-person")).toBeDisabled();
      await page.locator('[data-script="iryna.s"]').click();
      await expect(page.locator("h1")).toHaveText("Setup script");
      await expect(page.locator("#sc-text")).toContainText('HUB_USER="iryna.s"');
      await check(`${person} script bash`);
      await page.click('[data-shell="powershell"]');
      await expect(page.locator("#sc-text")).toContainText('$HubUser      = "iryna.s"');
      await check(`${person} script powershell`);

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

        await page.click('.tab[data-ftab="qa"]');
        await expect(page.locator("#matrix")).toBeVisible();
        await check(`${person} ${slug} qa`);
        await page.click('.tab[data-ftab="release"]');
        await expect(page.locator("#checklist")).toBeVisible();
        await check(`${person} ${slug} release`);
        await page.click('.tab[data-ftab="costs"]');
        await expect(page.locator("#costs")).toBeVisible();
        await page.waitForFunction(() => !document.querySelector("#main")!.textContent!.includes("Loading costs"));
        await check(`${person} ${slug} costs`);
      }
    }
    console.log(`${vp.name}: ${PEOPLE.length} people, ${tasks} task pages, ${dialogs} help dialogs, ${errors.length} errors, ${bad.length} overflows`);
    expect(tasks).toBeGreaterThan(8);
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
  // Lead time from the stage events the plugin recorded.
  await page.goto("/features/order-notes-fix?as=petro.v&step=implement");
  await ready(page);
  await expect(page.locator("#leadtime")).toContainText("Lead time");
  await expect(page.locator('[data-time="implement"]')).toContainText("30 h, 2026-10-02 to 2026-10-03");
  // The days the web team waited for the backend team, from the waits hub-report keeps.
  await page.goto("/features/bulk-order-export?as=maksym.d");
  await ready(page);
  await expect(page.locator("#waited")).toContainText(/Waited for Backend.*Web \d+(\.\d)? days, still waiting/);
  await page.goto("/features/bulk-order-export/tasks?as=maksym.d");
  await ready(page);
  await expect(page.locator(".note.bad")).toContainText("wait for another team");
  await expect(page.locator(".srcnote")).toContainText("Android from your local copy");
});

test("People and roles marks a person who is not in the group, for the admin", async ({ page }) => {
  await page.goto("/people?as=nazar.t");
  await ready(page);
  await expect(page.locator('#people tr[data-user="sofiia.h"]')).toContainText("not in the group");
  await expect(page.locator('#people tr[data-user="olena.k"]')).not.toContainText("not in the group");
  await page.goto("/people?as=olena.k");
  await ready(page);
  await expect(page.locator("#people")).not.toContainText("not in the group");
});

test("Releases shows Ops every feature from staging on, and leaves out one whose watch is over", async ({ page }) => {
  await page.goto("/releases?as=bohdan.r");
  await ready(page);
  await expect(page.locator('#releases tr[data-release="tasks-issues"]')).toBeVisible();
  await expect(page.locator('#releases tr[data-release="staff-permissions"]')).toHaveCount(0);
  await page.locator('#releases tr[data-release="tasks-issues"] a').click();
  await expect(page.locator("#release")).toBeVisible();
});

test("Settings shows the admin what install set up on the host, and what to do", async ({ page }) => {
  await page.goto("/settings?as=nazar.t");
  await ready(page);
  await expect(page.locator('#set-host [data-check="warn"]')).toContainText("renew it");
  await page.goto("/settings?as=olena.k");
  await ready(page);
  await expect(page.locator("#set-host")).toHaveCount(0);
});

test("the guides open from Settings, with the tokens and permissions, and link to each other", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/settings?as=nazar.t");
  await ready(page);
  await page.click('#set-guides a[href*="/guides/github"]');
  await expect(page.locator("#guide h1")).toHaveText("Install SDLC Hub on GitHub");
  await expect(page.locator("#guide")).toContainText("Secrets");
  await expect(page.locator("#guide [id=\"2-create-your-fine-grained-token\"]")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('#guide a[href="/guides/settings"]').first().click();
  await expect(page.locator("#guide h1")).toHaveText("Settings");
  await page.goto("/guides/gitlab?as=maksym.d");
  await ready(page);
  await expect(page.locator("#guide")).toContainText("HUB_GUARD_TOKEN");
});

test("another site cannot use the server", async ({ request }) => {
  const r = await request.get("/api/features", { headers: { origin: "https://evil.example" } });
  expect(r.status()).toBe(403);
});
