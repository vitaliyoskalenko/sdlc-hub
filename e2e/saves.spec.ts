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

  test("the admin adds a person on the Team page; it merges and the person gets a script", async ({ page }) => {
    await page.goto(`${DEMO}/people?as=nazar.t`);
    await page.waitForSelector("#people");
    await page.click("#add-person");
    await expect(page.locator("#pf-save")).toBeDisabled();
    await page.fill("#pf-user", "anna.b");
    await page.fill("#pf-name", "Anna B.");
    await page.click('[data-role="dev"]'); // off: dev was the default
    await page.click('[data-role="qa"]');
    await page.selectOption("#pf-os", "windows");
    await page.click("#pf-save");
    await expect(page.locator("#people-saves")).toContainText("Add anna.b on the Team page");
    await expect(page.locator('#people tr[data-user="anna.b"]')).toBeVisible({ timeout: 20_000 });
    await page.locator('[data-script="anna.b"]').click();
    await expect(page.locator('[data-shell="powershell"]')).toHaveAttribute("aria-pressed", "true"); // her system
    await expect(page.locator("#sc-text")).toContainText('$HubRoles     = "qa"');
  });

  test("someone who is not the admin cannot change people", async ({ page }) => {
    await page.goto(`${DEMO}/people?as=maksym.d`);
    await page.waitForSelector("#people");
    await expect(page.locator("#add-person")).toBeDisabled();
    await expect(page.locator("[data-edit], [data-remove]")).toHaveCount(0);
    await expect(page.locator(".note.warn")).toContainText("Only the admin changes people");
  });

  test("only the admin changes Settings; the others read them, with the reason", async ({ page }) => {
    await page.goto(`${DEMO}/settings?as=maksym.d`);
    await page.waitForSelector("#set-guard");
    await expect(page.locator(".note.warn")).toContainText("Only the admin changes Settings");
    await expect(page.locator("#set-mode-advisory")).toBeDisabled();
    await expect(page.locator("#set-save")).toBeDisabled();
  });

  test("the admin sets hub-guard to advisory and turns a check off; it merges and Settings shows it", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${DEMO}/settings?as=nazar.t`);
    await page.waitForSelector("#set-guard");
    await expect(page.locator("#set-guard")).toContainText("enforce");
    await expect(page.locator("#set-save")).toBeDisabled();
    await page.check("#set-mode-advisory");
    await page.uncheck("#set-check-pushers");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.click("#set-save");
    await expect(page.locator('[data-save="pending"]')).toContainText("Change Settings");
    await expect(page.locator("#set-guard .pill")).toHaveText("advisory", { timeout: 20_000 });
    await expect(page.locator("#set-guard")).toContainText("off: everyone who pushed");
    await expect(page.locator("#set-save")).toBeDisabled();
  });

  test("the PM changes a feature's title and adds a link; it merges and the page shows them", async ({ page }) => {
    await page.goto(`${DEMO}/features/returns-portal?as=maksym.d`);
    await page.waitForSelector("#steph");
    await page.click("#edit-details");
    await expect(page.locator("#df-save")).toBeDisabled();
    await page.fill("#df-title", "Returns portal for buyers");
    await page.fill("#df-figma", "https://figma.com/file/returns");
    // The issue key is enough: the hub makes it a link on the project's Jira.
    await page.fill("#df-jira", "SHOP-499");
    await page.click("#df-save");
    await expect(page.locator("h1")).toHaveText("Returns portal for buyers", { timeout: 20_000 });
    await expect(page.locator('a.btn[href="https://figma.com/file/returns"]')).toBeVisible();
    await expect(page.locator('a.btn[href="https://jira.example.com/browse/SHOP-499"]')).toHaveText("SHOP-499 ↗");
  });

  test("someone other than the PM or the admin sees no Edit details", async ({ page }) => {
    await page.goto(`${DEMO}/features/returns-portal?as=daria.l`);
    await page.waitForSelector("#steph");
    await expect(page.locator("#edit-details")).toHaveCount(0);
  });

  test("the admin adds a team on Settings; it merges and the next step is named", async ({ page }) => {
    await page.goto(`${DEMO}/settings?as=nazar.t`);
    await page.waitForSelector("#set-project");
    await page.click("#add-team");
    await page.fill("#tf-name", "Desktop");
    await page.fill("#tf-repo", "desktop-app");
    await page.selectOption("#tf-kind", "desktop");
    await page.click("#tf-save");
    await expect(page.locator("#team-next")).toContainText("node hub/cli.js connect-teams");
    await expect(page.locator("#set-project")).toContainText("shop/desktop-app", { timeout: 20_000 });
  });

  test("a person with two roles chooses the one to work in, for Home and Your guide", async ({ page }) => {
    await page.goto(`${DEMO}/people?as=nazar.t`);
    await page.waitForSelector("#people");
    await page.click("#add-person");
    await page.fill("#pf-user", "ivan.r");
    await page.fill("#pf-name", "Ivan R.");
    await page.click('[data-role="dev"]'); // off: dev was the default
    await page.click('[data-role="pm"]');
    await page.click('[data-role="qa"]');
    await page.click("#pf-save");
    await expect(page.locator('#people tr[data-user="ivan.r"]')).toBeVisible({ timeout: 20_000 });
    await page.goto(`${DEMO}/?as=ivan.r`);
    await page.waitForSelector("#workas");
    await expect(page.locator("#workas option")).toHaveText(["Project manager", "QA"]);
    await page.selectOption("#workas", "qa");
    await expect(page.locator("#main")).toContainText("Features at a QA step");
    await page.click("#guidebtn");
    await expect(page.locator("#other-roles")).toContainText("You also work as");
    await page.locator("#other-roles button").click();
    await expect(page.locator("#workas")).toHaveValue("pm");
  });

  test("the admin overrides a model's price on Settings; it merges and shows as an override", async ({ page }) => {
    await page.goto(`${DEMO}/settings?as=nazar.t`);
    await page.waitForSelector("#set-prices");
    const row = page.locator('#set-prices tr[data-model="claude-opus-5-5"]');
    await row.locator("[data-edit-price]").click();
    await row.locator('input[aria-label="claude-opus-5-5 output"]').fill("18");
    await row.locator("[data-save-price]").click();
    await expect(row).toContainText("override", { timeout: 20_000 });
    await expect(row).toContainText("$18");
  });

  test("the admin edits a team on Settings, and cannot remove one people are still in", async ({ page }) => {
    await page.goto(`${DEMO}/settings?as=nazar.t`);
    await page.waitForSelector("#teams");
    const web = page.locator('#teams tr[data-team-row="web"]');
    await web.locator("[data-edit-team]").click();
    await web.locator('input[aria-label="Test command"]').fill("npm run test:web");
    await web.locator("[data-save-team]").click();
    await expect(web).toContainText("npm run test:web", { timeout: 20_000 });
    // Petro is in the web team: removing it is refused, with the reason, before anything is pushed.
    await web.locator("[data-remove-team]").click();
    await web.locator("[data-confirm-remove]").click();
    await expect(page.locator("#set-project .problem")).toContainText("petro.v is in team web");
  });
});
