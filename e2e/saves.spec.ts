// Saving from the site, on a demo project of its own: the PO signs off clarify and the backend lead returns the
// technical design. Each save is pending until the demo's stand-in for GitLab runs hub-guard and merges it.

import { expect, test, type Page } from "@playwright/test";

const DEMO = "http://127.0.0.1:4190";

async function step(page: Page, who: string, slug: string, id: string) {
  await page.goto(`${DEMO}/features/${slug}?as=${who}&step=${id}`);
  await page.waitForSelector("#steph");
}

test.describe.serial("saves from the site", () => {
  test("the PO signs off clarify: pending, then merged, and the step is done", async ({ page }) => {
    await step(page, "olena.k", "returns-portal", "clarify");
    await page.click("#signoff");
    await expect(page.locator('[data-save="pending"]')).toContainText("waiting to merge");
    await expect(page.locator(".sd")).toContainText("Done", { timeout: 20_000 });
    await expect(page.locator("#signoff")).toHaveCount(0);
    await expect(page.locator(".kv")).toContainText("Olena K.");
  });

  test("someone whose gate it is not sees no Sign off", async ({ page }) => {
    await step(page, "maksym.d", "order-webhooks", "tech-design");
    await expect(page.locator("#signoff")).toHaveCount(0);
  });

  test("the backend lead returns the technical design with a reason, on a phone", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await step(page, "taras.m", "order-webhooks", "tech-design");
    await page.click("#return");
    await expect(page.locator("#send-return")).toBeDisabled();
    await page.fill("#reason", "The retry policy needs an upper bound");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.click("#send-return");
    await expect(page.locator('[data-save="pending"]')).toBeVisible();
    await expect(page.locator(".sd")).toContainText("Returned", { timeout: 20_000 });
    // The gate waits again, and Home lists nothing unfinished.
    await expect(page.locator("#signoff")).toBeVisible();
    await page.goto(`${DEMO}/?as=taras.m`);
    await page.waitForSelector("#main h1");
    await expect(page.locator('[data-save="pending"], [data-save="refused"]')).toHaveCount(0);
  });
});
