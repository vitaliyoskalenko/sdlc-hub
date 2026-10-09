// Phase 3 is done when a feature goes from staging to released with the site as the only tracker. On a demo of
// its own (fixture release-walk: one shipped web feature, green in CI, no watch period), each person does their part
// on the site; every save is a merge request that the demo's stand-in for GitLab judges with hub-guard and merges.

import { expect, test, type Page } from "@playwright/test";

const DEMO = "http://127.0.0.1:4189";
const SLUG = "gift-cards";

async function open(page: Page, who: string, tab: "qa" | "release" | "") {
  await page.goto(`${DEMO}/features/${SLUG}${tab ? `/${tab}` : ""}?as=${who}`);
  await page.waitForSelector(tab ? `#${tab}` : "svg.flow");
}
/** Waits until the save is made and then merged: it shows as waiting to merge, then no longer. */
async function merged(page: Page) {
  await expect(page.locator('[data-save="pending"]').first()).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('[data-save="pending"]')).toHaveCount(0, { timeout: 20_000 });
}
const now = (page: Page) => page.locator(".now");

test("a feature goes from staging to released on the site", async ({ page }) => {
  test.setTimeout(240_000);
  await open(page, "bohdan.r", "");
  await expect(now(page)).toContainText("staging");

  // Ops: the smoke check passed on staging.
  await open(page, "bohdan.r", "release");
  await page.click('[data-smoke="passed"]');
  await merged(page);
  await expect(page.locator("#staging")).toContainText("passed");

  // QA: a verdict for every criterion, then the sign-off of verify.
  await open(page, "iryna.s", "qa");
  await expect(page.locator("#qa")).toContainText("verify");
  await page.click("#signoff");
  await expect(page.locator(".problem")).toContainText("Not every criterion passes yet");
  await page.selectOption("#vf-platform", "all");
  await page.click('[data-verdict="pass"]');
  await page.click("#vf-save");
  await merged(page);
  await expect(page.locator('[data-cell="AC-01|web"]')).toContainText("pass");
  await page.click("#signoff");
  await merged(page);

  // QA: autotests are green in CI, so the final check is QA's: pass to release.
  await expect(page.locator("#decide-pass")).toBeVisible({ timeout: 20_000 });
  await page.click("#decide-pass");
  await merged(page);
  await expect(page.locator("#qa .history")).toContainText("passed");

  // PO accepts, then the PM gives the go.
  await open(page, "olena.k", "release");
  await page.click("#signoff");
  await merged(page);
  await open(page, "maksym.d", "release");
  await page.click('[data-go="go"]');
  await merged(page);
  await expect(page.locator("#go")).toContainText("go");

  // Ops: the checklist, then the rollout to 100%, which starts (and, with no watch period, ends) the watch.
  await open(page, "bohdan.r", "release");
  const items = await page.locator("[data-item]").count();
  expect(items).toBe(4);
  for (let k = 0; k < items; k++) {
    await page.locator("[data-item]").nth(k).check();
    await merged(page);
  }
  // The version each team shipped.
  const web = page.locator('#versions tr[data-team="web"]');
  await web.locator("input").fill("admin build 870");
  await web.locator("button").click();
  await merged(page);
  await expect(web.locator("input")).toHaveValue("admin build 870");
  await expect(web.locator("button")).toHaveCount(0);
  await page.click('[data-stage="100"]');
  await merged(page);
  await expect(page.locator("#watch")).toContainText("watch period over");

  await open(page, "bohdan.r", "");
  await expect(now(page)).toContainText("Released");
});

test("each role sees only its own controls on the release, with the reason", async ({ page }) => {
  await open(page, "iryna.s", "release");
  await expect(page.locator('[data-go="go"]')).toBeDisabled();
  await expect(page.locator("#go")).toContainText("Only the PM gives the go or the no-go.");
  await expect(page.locator('[data-smoke="passed"]')).toBeDisabled();
  await expect(page.locator("#staging")).toContainText("Only Ops changes this.");
});
