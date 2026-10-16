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

      // Team, and a setup script in both shells.
      await page.click('.nb[data-page="people"]');
      await expect(page.locator("h1")).toHaveText("Team");
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
        // The role-lane map on a desktop; on a phone, the list of steps.
        const steps = vp.name === "phone" ? ".flowlist [data-flow-item]" : "svg.flow [data-step]";
        await expect(page.locator(steps).first()).toBeVisible();
        await check(`${person} ${slug} flow`);
        // Every step opens its panel.
        expect(await page.locator(steps).count()).toBe(20);
        for (const k of [0, 4, 11, 16]) {
          await page.locator(steps).nth(k).click();
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
  await expect(page.locator('#leadtime [data-step-time="implement"]')).toContainText("30 h");
  await expect(page.locator('[data-time="implement"]')).toContainText("30 h, 2026-10-02 to 2026-10-03");
  // The days the web team waited for the backend team, from the waits hub-report keeps.
  await page.goto("/features/bulk-order-export?as=maksym.d");
  await ready(page);
  await expect(page.locator("#waited")).toContainText(/Waited for Backend.*Web \d+(\.\d)? days, still waiting/);
  await page.goto("/features/bulk-order-export/tasks?as=maksym.d");
  await ready(page);
  await expect(page.locator(".note.bad")).toContainText("wait for another team");
  await expect(page.locator(".srcnote")).toContainText("From your local copy: Android");
});

test("each feature's buttons open its own Jira issue, Confluence page, Figma file and staging address", async ({ page }) => {
  const links = async (slug: string) => {
    await page.goto(`/features/${slug}?as=maksym.d`);
    await ready(page);
    return page.locator(".ph a.btn[target=_blank]").evaluateAll((as) => as.map((a) => [a.textContent!.replace(" ↗", "").trim(), (a as HTMLAnchorElement).href, a.getAttribute("title")]));
  };
  const bulk = await links("bulk-order-export");
  const notes = await links("order-notes-fix");
  expect(bulk.map(([label]) => label)).toEqual(["SHOP-431", "Confluence", "Figma", "Staging"]);
  expect(bulk[0]).toEqual(["SHOP-431", "https://jira.example.com/browse/SHOP-431", "https://jira.example.com/browse/SHOP-431"]);
  for (const i of [0, 1, 2, 3]) expect(bulk[i]![1]).not.toEqual(notes[i]![1]);
  // No user interface, no Figma file.
  expect((await links("order-webhooks")).map(([label]) => label)).toEqual(["SHOP-445", "Confluence", "Staging"]);
});

test("The Team page marks a person who is not in the group, for the admin", async ({ page }) => {
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

test("Help lists the guides by who needs them and each role's work, and opens the guides", async ({ page }) => {
  await page.goto("/?as=iryna.s");
  await ready(page);
  await page.click('.nb[data-page="help"]');
  await expect(page.locator("h1")).toHaveText("Help");
  await expect(page.locator("#help-roles [data-role-help]").first()).toContainText("QA");
  await expect(page.locator('#help-roles [data-role-help="qa"]')).toContainText("you");
  await page.click('#help-everyone a[href*="/guides/people"]');
  await expect(page.locator("#guide h1")).toHaveText("Add people and set up their machines");
  await expect(page.locator(".crumb")).toContainText("Help");
});

test("Help's links open the guide at their section, as the same person", async ({ page }) => {
  for (const [link, heading] of [["Set up your machine", "the-person-runs-the-script"], ["Every day", "every-day"]] as const) {
    await page.goto("/help?as=iryna.s");
    await ready(page);
    await page.locator("#help-everyone a", { hasText: link }).click();
    await expect(page.locator("#guide h1")).toHaveText("Add people and set up their machines");
    await expect(page.locator(`#guide [id="${heading}"]`)).toBeInViewport();
    await expect(page.locator("#persona")).toHaveValue("iryna.s");
  }
});

test("Your guide opens the guide of any role", async ({ page }) => {
  await page.goto("/guide?as=olena.k");
  await ready(page);
  await expect(page.locator("h1")).toHaveText("Your guide");
  await page.click('[data-guide-role="qa"]');
  await expect(page.locator("h1")).toHaveText("Guide for QA");
  await expect(page.locator("#main")).toContainText("/hub:verify");
  await page.click('[data-guide-role="po"]');
  await expect(page.locator("h1")).toHaveText("Your guide");
});

test("Help shows the flow, every command, the statuses, the words and what to do when something goes wrong", async ({ page }) => {
  await page.goto("/help?as=taras.m");
  await ready(page);
  await expect(page.locator("#help-flow [data-flow-step]")).toHaveCount(20);
  await expect(page.locator('#help-flow [data-flow-step="clarify"]')).toContainText("PO");
  await page.locator('#help-commands [data-command="signoff"] button').click();
  await expect(page.locator("dialog[open], .dialog, [role=dialog]").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#help-statuses")).toContainText("Waiting for sign-off");
  await expect(page.locator("#help-trouble")).toContainText("My save was refused");
  await page.locator('#help-roles [data-role-help="qa"]').click();
  await expect(page.locator("h1")).toHaveText("Guide for QA");
});

test("the guides open from Help, with the tokens and permissions, and link to each other", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/help?as=nazar.t");
  await ready(page);
  await page.click('#help-admin a[href*="/guides/github"]');
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

test("a feature whose step moved since you last looked is marked, until you open it", async ({ page }) => {
  await page.goto("/?as=maksym.d");
  await ready(page);
  // The first visit takes everything as seen.
  await expect(page.locator("[data-changed]")).toHaveCount(0);
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.startsWith("hub.seen.") && k.endsWith(".maksym.d"))!;
    const seen = JSON.parse(localStorage.getItem(key)!);
    seen["order-notes-fix"] = "implement|running";
    delete seen["returns-portal"];
    localStorage.setItem(key, JSON.stringify(seen));
  });
  await page.reload();
  await ready(page);
  await expect(page.locator('[data-changed="order-notes-fix"]')).toHaveText("moved to review");
  await expect(page.locator('[data-changed="returns-portal"]')).toHaveText("new");
  await expect(page.locator("#changedbar")).toContainText("2 changed");
  await page.locator("a", { hasText: "Order notes lose line breaks" }).first().click();
  await expect(page.locator("h1")).toHaveText("Order notes lose line breaks");
  await page.click('.nb[data-page="home"]');
  await expect(page.locator('[data-changed="order-notes-fix"]')).toHaveCount(0);
  await page.click("#mark-seen");
  await expect(page.locator("#changedbar")).toHaveCount(0);
});

test("keyboard shortcuts open the pages, the search and the help", async ({ page }) => {
  await page.goto("/?as=iryna.s");
  await ready(page);
  await page.keyboard.press("g");
  await page.keyboard.press("f");
  await expect(page.locator("h1")).toHaveText("Features");
  await page.keyboard.press("g");
  await page.keyboard.press("r");
  await expect(page.locator("h1")).toHaveText("Releases");
  await page.keyboard.press("/");
  await expect(page.locator("#fsearch")).toBeFocused();
  // Typing in a field is not a shortcut.
  await page.keyboard.type("gh");
  await expect(page.locator("h1")).toHaveText("Features");
  await expect(page.locator("#fsearch")).toHaveValue("gh");
  await page.locator("#fsearch").blur();
  await page.keyboard.press("?");
  await expect(page.locator("h1")).toHaveText("Help");
  await expect(page.locator("#help-keys")).toContainText("Find a feature");
});

test("a copy button says what it copied", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/guide?as=taras.m");
  await ready(page);
  await page.locator(".cmd .copy").first().click();
  await expect(page.locator("#toast")).toContainText("Copied: /hub:next");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("/hub:next <slug>");
});

test("Notify me says why when the browser blocks notifications", async ({ page }) => {
  // Headless Chromium denies notifications.
  await page.goto("/?as=iryna.s");
  await ready(page);
  await expect(page.locator(".notify-off")).toContainText("Blocked in the browser's settings");
  await expect(page.locator("#notify")).toBeDisabled();
});

test("on a phone, the flow is a list of steps that opens each one", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto("/features/tasks-issues?as=iryna.s");
  await ready(page);
  await expect(page.locator("svg.flow")).toBeHidden();
  await expect(page.locator(".flowlist [data-flow-item]")).toHaveCount(20);
  await expect(page.locator('.flowlist [data-flow-item="verify"]')).toHaveAttribute("aria-current", "step");
  await page.click('.flowlist [data-flow-item="specify"]');
  await expect(page.locator("#steppanel")).toContainText("Step 1 of 20");
});

test("a released feature's checklist is a record and no longer changes", async ({ page }) => {
  await page.goto("/features/staff-permissions/release?as=bohdan.r");
  await ready(page);
  await expect(page.locator("#checklist-locked")).toBeVisible();
  await expect(page.locator("#checklist input").first()).toBeDisabled();
  await expect(page.locator("#new-item")).toHaveCount(0);
});

test("another site cannot use the server", async ({ request }) => {
  const r = await request.get("/api/features", { headers: { origin: "https://evil.example" } });
  expect(r.status()).toBe(403);
});

test("rules read as plain words, and a step's command shows only to its role", async ({ page }) => {
  await page.goto("/guide?as=olena.k");
  await ready(page);
  const rule = page.locator(".rule").first();
  await expect(rule).toHaveAttribute("title", /.+/);
  await expect(page.locator(".rule", { hasText: "docs/features/*/" })).toHaveCount(0);
  await page.goto("/features/order-notes-fix?as=olena.k&step=implement");
  await ready(page);
  await expect(page.locator("#not-your-step")).toContainText("runs this step in their assistant");
  await page.goto("/features/order-notes-fix?as=petro.v&step=implement");
  await ready(page);
  await expect(page.locator("#not-your-step")).toHaveCount(0);
});

test("the flow map shows status colours by default, can show roles or the path instead, and marks the step in progress", async ({ page }) => {
  await page.goto("/features/bulk-order-export?as=maksym.d");
  await ready(page);
  await expect(page.locator("svg.flow")).toHaveClass(/look-status/);
  await expect(page.locator('svg.flow .node.here[data-step="implement"]')).toHaveCount(1);
  await expect(page.locator("#flow-now")).toContainText("now");
  await expect(page.locator("#flow-legend")).toContainText("blocked, returned or missed");
  await page.click('[data-flowlook="roles"]');
  await expect(page.locator("svg.flow")).toHaveClass(/look-roles/);
  await expect(page.locator("#flow-legend")).toContainText("waiting for sign-off");
  // Kept in this browser.
  await page.reload();
  await ready(page);
  await expect(page.locator('[data-flowlook="roles"]')).toHaveAttribute("aria-pressed", "true");
  await page.click('[data-flowlook="path"]');
  await expect(page.locator("svg.flow")).toHaveClass(/look-path/);
  await expect(page.locator("#flow-legend")).toContainText("the path so far");
  expect(await page.locator("svg.flow .wire.done").count()).toBeGreaterThan(5);
});

test("a lane's role is explained when pointed at", async ({ page }) => {
  await page.goto("/features/bulk-order-export?as=maksym.d");
  await ready(page);
  await page.hover('svg.flow .lanehd[data-lane="po"]');
  await expect(page.locator("#lane-tip")).toContainText("PO / Analyst");
  await expect(page.locator("#lane-tip")).toContainText("Steps: specify, clarify, accept");
  await page.mouse.move(0, 0);
  await expect(page.locator("#lane-tip")).toHaveCount(0);
  await page.click('[data-flowlook="roles"]');
  await expect(page.locator("#flow-legend")).not.toContainText("Engineering");
});

test("a step, a tab or a document of the same page keeps the scroll; another page opens at its top", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.goto("/features/bulk-order-export?as=maksym.d");
  await ready(page);
  await page.evaluate(() => scrollTo(0, 220));
  const y = () => page.evaluate(() => Math.round(scrollY));
  await page.click('svg.flow [data-step="tasks"]');
  await expect(page.locator("#steph")).toHaveText(/./);
  expect(await y()).toBe(220);
  await page.click('[data-ftab="documents"]');
  await expect(page.locator(".docbtn").first()).toBeVisible();
  expect(await y()).toBe(220);
  await page.locator(".docbtn").nth(1).click();
  expect(await y()).toBe(220);
  await page.click('nav a[href*="/releases"], a[href^="/releases"]');
  await expect(page.locator("h1")).toHaveText("Releases");
  expect(await y()).toBe(0);
});
