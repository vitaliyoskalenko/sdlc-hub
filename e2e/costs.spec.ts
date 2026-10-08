// Costs on the demo: a month of made-up usage, encrypted at demo start. Everyone sees the open totals, by step, for
// groups of three people or more; only the admin and the PM see each person.

import { expect, test, type Page } from "@playwright/test";

async function costs(page: Page, who: string, slug = "tasks-issues") {
  await page.goto(`/features/${slug}/costs?as=${who}`);
  await page.waitForSelector("#costs");
}

test("QA sees the feature's totals by step, and no person", async ({ page }) => {
  await costs(page, "iryna.s");
  await expect(page.locator("#cost-total")).toContainText("People");
  await expect(page.locator('#cost-steps tr[data-step="implement"]')).toContainText("4");
  // One person wrote the spec: that step is not shown on its own.
  await expect(page.locator('#cost-steps tr[data-step="specify"]')).toHaveCount(0);
  await expect(page.locator("#cost-people")).toHaveCount(0);
  await expect(page.locator("#estimate")).toContainText("The PM sets the estimate.");
});

test("a feature one person worked on shows no total, only that it is counted in other", async ({ page }) => {
  await costs(page, "iryna.s", "returns-portal");
  await expect(page.locator("#cost-total")).toContainText('counted in "other"');
});

test("the PM sees each person, decrypted on this machine, and sets the estimate", async ({ page }) => {
  await costs(page, "maksym.d");
  await expect(page.locator("#cost-people")).toContainText("Olena K.");
  await expect(page.locator("#cost-people")).toContainText("Only the admin and the PM see this.");
  // The prototype's estimate: Save waits for a change.
  await expect(page.locator("#estimate")).toContainText("52–118M tokens");
  await expect(page.locator("#est-save")).toBeDisabled();
  await page.fill("#est-lo", "40");
  await page.fill("#est-hi", "60");
  await expect(page.locator("#est-save")).toBeEnabled();
});

test("the admin sees each person too", async ({ page }) => {
  await costs(page, "nazar.t");
  await expect(page.locator('#cost-people tr[data-person="taras.m"]').first()).toBeVisible();
});
