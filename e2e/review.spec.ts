// The owner's review of phase 1a, as checks: does each role see from Home what is expected of them, does the Now
// strip agree with the map, does the graph show where each feature is and who holds it, are waits between teams
// visible beyond the Tasks screen, and are steps skipped by route or by `ui: false` shown as skipped, not missed.

import { expect, test, type Page } from "@playwright/test";

const DEMO = "http://127.0.0.1:4198";
const FEATURES = ["tasks-issues", "bulk-order-export", "returns-portal", "order-notes-fix", "staff-permissions", "order-webhooks"];
const LABEL_TO_STATUS: Record<string, string> = {
  Done: "done", Running: "running", "Waiting for sign-off": "signoff", Returned: "returned", Blocked: "blocked",
  "Ready to start": "ready", "Not started": "todo", "Skipped on this route": "skipped", Missed: "missed",
};

async function open(page: Page, url: string) {
  await page.goto(url);
  await page.waitForSelector("#main h1");
  await page.waitForFunction(() => !document.body.innerText.includes("Loading"));
}

const actions = (page: Page) => page.locator(".arow").allInnerTexts();

test.describe("Home tells each role what is expected", () => {
  test("QA sees the feature returned to verify, with the reason", async ({ page }) => {
    await open(page, `${DEMO}/?as=iryna.s`);
    const a = (await actions(page)).join("\n");
    expect(a).toMatch(/verify came back to you/);
    expect(a).toMatch(/BUG-0012/);
  });

  test("the PM sees that client teams wait for backend", async ({ page }) => {
    await open(page, `${DEMO}/?as=maksym.d`);
    const a = (await actions(page)).join("\n");
    expect(a).toMatch(/bulk-order-export/);
    expect(a).toMatch(/Web, Android and iOS wait for Backend T2/);
  });

  test("the backend lead sees that three teams wait for his task, and the sign-off he owes", async ({ page }) => {
    await open(page, `${DEMO}/?as=taras.m`);
    const a = await actions(page);
    expect(a[0]).toMatch(/Web, Android and iOS wait for your T2/);
    expect(a.join("\n")).toMatch(/Sign off tech-design for order-webhooks/);
    expect(a.join("\n")).not.toMatch(/\.\./);
  });

  test("a client lead sees which of his tasks waits for backend", async ({ page }) => {
    await open(page, `${DEMO}/?as=petro.v`);
    expect((await actions(page)).join("\n")).toMatch(/Your T3 waits for Backend T2/);
  });

  test("the admin sees that nothing waits for him", async ({ page }) => {
    await open(page, `${DEMO}/?as=nazar.t`);
    await expect(page.locator(".lockbox")).toContainText("Nothing is waiting for you");
  });

  test("project statistics count the teams blocked by another team", async ({ page }) => {
    await open(page, `${DEMO}/?as=maksym.d`);
    const kpi = page.locator(".kpi", { hasText: "Blocked by another team" });
    await expect(kpi.locator("b")).toHaveText("3");
    await kpi.click();
    await expect(page.locator("h1")).toHaveText("Features");
    await expect(page.locator("tbody tr")).toHaveCount(1);
  });
});

test("the Now strip agrees with the map on every feature", async ({ page }) => {
  for (const slug of FEATURES) {
    await open(page, `${DEMO}/features/${slug}?as=olena.k`);
    const now = await page.locator(".now").innerText();
    if (/Released/.test(now)) {
      await expect(page.locator('svg.flow [data-step="release"]')).toHaveClass(/st-done/);
      continue;
    }
    const m = /step (\d+) of 20 · ([a-z-]+)/.exec(now)!;
    expect(m, slug).not.toBeNull();
    const label = await page.locator(".now .pill").first().innerText();
    const status = LABEL_TO_STATUS[label.trim()];
    const node = page.locator(`svg.flow [data-step="${m[2]}"]`);
    await expect(node, slug).toHaveClass(new RegExp(`st-${status}`));
    // The step's place on the map is the number in the strip.
    const ids = await page.locator("svg.flow [data-step]").evaluateAll((els) => els.map((e) => e.getAttribute("data-step")));
    expect(ids.indexOf(m[2]!) + 1, slug).toBe(Number(m[1]));
    // The step panel opens on the same step with the same status.
    await expect(page.locator("#steppanel h3")).toBeVisible();
    await expect(page.locator("#steppanel .pill").first()).toHaveText(label.trim());
  }
});

test.describe("waits between teams are visible beyond the Tasks screen", () => {
  test("in the Features list", async ({ page }) => {
    await open(page, `${DEMO}/features?as=maksym.d`);
    const row = page.locator("tr", { hasText: "bulk-order-export" });
    await expect(row.locator(".waitmark")).toHaveText("⧗ 3 teams wait");
    await expect(row).toContainText("Web, Android and iOS wait for Backend T2");
    await expect(page.locator("tr", { hasText: "returns-portal" }).locator(".waitmark")).toHaveCount(0);
  });

  test("in the Now strip", async ({ page }) => {
    await open(page, `${DEMO}/features/bulk-order-export?as=maksym.d`);
    await expect(page.locator(".now .waitmark")).toHaveText("⧗ 3 teams wait");
    await expect(page.locator(".now")).toContainText("Web, Android and iOS wait for Backend T2");
  });

  test("on the graph, with who holds each feature", async ({ page }) => {
    await open(page, `${DEMO}/features?view=graph&as=maksym.d`);
    const head = (slug: string) => page.locator(`.fhd[data-slug="${slug}"]`);
    await expect(head("bulk-order-export")).toContainText("waits for Backend");
    await expect(page.locator('.fm.waits[data-slug="bulk-order-export"]')).toHaveCount(1);
    await expect(page.locator('.fm.waits[data-slug="bulk-order-export"] text.waitcount')).toHaveText("⧗3");
    await expect(head("returns-portal")).toContainText("Olena K.");
    await expect(head("order-webhooks")).toContainText("Taras M.");
    await expect(head("tasks-issues")).toContainText("Iryna S.");
    await expect(head("staff-permissions")).toContainText("released");
  });
});

test.describe("skipped, not missed", () => {
  test("quick-route: the steps the quick route skips", async ({ page }) => {
    await open(page, "http://127.0.0.1:4195/features/order-notes-fix?as=nazar.t");
    for (const id of ["clarify", "ux-flows", "data-model", "api", "screens"])
      await expect(page.locator(`svg.flow [data-step="${id}"]`), id).toHaveClass(/st-skipped/);
    await expect(page.locator("svg.flow .st-missed")).toHaveCount(0);
  });

  test("no-user-interface: ux-flows and screens with ui: false, on the full route", async ({ page }) => {
    await open(page, "http://127.0.0.1:4194/features/api-only?as=nazar.t");
    for (const id of ["ux-flows", "screens"]) await expect(page.locator(`svg.flow [data-step="${id}"]`), id).toHaveClass(/st-skipped/);
    await expect(page.locator("svg.flow .st-missed")).toHaveCount(0);
    await expect(page.locator(".sub")).toContainText("no user interface");
  });

  test("no-user-interface: without ui: false the hub says what to set", async ({ page }) => {
    await open(page, "http://127.0.0.1:4194/features/api-unmarked?as=nazar.t");
    await expect(page.locator('svg.flow [data-step="ux-flows"]')).toHaveClass(/st-missed/);
    const notes = page.locator("details.notes");
    await notes.locator("summary").click();
    await expect(notes).toContainText("set ui: false in feature.yaml");
  });
});

test.describe("the task page opens over Home", () => {
  test("for the backend lead: the tasks that wait for his T2, and the way to the Tasks screen", async ({ page }) => {
    await open(page, `${DEMO}/?as=taras.m`);
    await page.locator("[data-task]").first().click();
    const sheet = page.locator("#sheet .sheet");
    await expect(sheet.locator("h1")).toHaveText("Web, Android and iOS wait for your T2");
    await expect(sheet).toContainText("Tasks of other teams that wait for yours");
    await expect(sheet).toContainText("switch to the staging API");
    await expect(sheet.locator(".waitmark")).toHaveText("⧗ 3 teams wait");
    await expect(sheet.locator(".cmd code").first()).toHaveText("/hub:next bulk-order-export");
    // The page behind is inert while the task page is open.
    await expect(page.locator(".app")).toHaveAttribute("inert", "");
    await sheet.locator('[data-go="/features/bulk-order-export/tasks"]').click();
    await expect(page.locator("#sheet")).toHaveCount(0);
    await expect(page.locator('.tab[data-ftab="tasks"]')).toHaveAttribute("aria-selected", "true");
  });

  test("for QA: the open bugs and the latest test runs, local runs labelled", async ({ page }) => {
    await open(page, `${DEMO}/?as=iryna.s`);
    await page.locator("[data-task]").first().click();
    const sheet = page.locator("#sheet .sheet");
    await expect(sheet).toContainText("Task visible after access to the order was revoked");
    await expect(sheet).toContainText("Task form has no state for a 403 response");
    await expect(sheet).not.toContainText("Due date picker opens one day early");
    await expect(sheet).toContainText("pipeline #8841");
    await expect(sheet).toContainText("local run by andrii.p");
    await expect(sheet.locator(".cmd code").first()).toHaveText("/hub:verify tasks-issues");
  });

  test("for the PO: the step, its gate and the prompt", async ({ page }) => {
    await open(page, `${DEMO}/?as=olena.k`);
    await page.locator("[data-task]").first().click();
    const sheet = page.locator("#sheet .sheet");
    await expect(sheet.locator("#steph")).toHaveText("Closing ambiguities");
    await expect(sheet).toContainText("Waiting on");
    await sheet.locator('[data-go="/features/returns-portal"]').click();
    await expect(page.locator("#steppanel h3")).toHaveText("Closing ambiguities");
  });

  test("Escape gives the focus back to the action", async ({ page }) => {
    await open(page, `${DEMO}/?as=taras.m`);
    const first = page.locator("[data-task]").first();
    await first.click();
    await expect(page.locator("#sheet-x")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(first).toBeFocused();
  });
});
