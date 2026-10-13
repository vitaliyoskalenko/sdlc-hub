// The static sample, docs/sample/index.html: one file that opens from disk, with the demo's answers recorded and
// nothing to save. `npm run sample` rebuilds it.

import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "@playwright/test";

const SAMPLE = pathToFileURL(join(import.meta.dirname, "../docs/sample/index.html")).href;

test("the static sample opens from a file, moves between pages and people, and says it saves nothing", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(SAMPLE);
  await expect(page.locator("h1")).toHaveText("Home");
  await expect(page.locator("#hub-behind")).toContainText("nothing is saved here");
  await page.click('.nb[data-page="features"]');
  await expect(page.locator("h1")).toHaveText("Features");
  expect(page.url()).toContain("#/features");
  await page.locator("a", { hasText: "Tasks & issues in the Marketplace admin" }).first().click();
  await page.click('.tab[data-ftab="qa"]');
  await expect(page.locator("#matrix")).toContainText("AC-04");
  await page.selectOption("#persona", "nazar.t");
  await page.click('.nb[data-page="people"]');
  await expect(page.locator("#people tr")).toHaveCount(11);
  await page.goBack();
  await expect(page.locator("#matrix")).toBeVisible();
  // A save is refused with the reason.
  await page.goto(`${SAMPLE}#/features/returns-portal?as=olena.k`);
  await expect(page.locator("#signoff")).toBeDisabled();
  expect(errors).toEqual([]);
});
