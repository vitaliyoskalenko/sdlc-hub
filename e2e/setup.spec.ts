// The first-install site, like prototypes/setup/test_walk.py: both hosts, validation, both widths, no script errors
// and no sideways scroll. With the local GitLab (HUB_GITLAB_IT=1, e2e/gitlab/bootstrap.mjs) it signs in for real and
// walks every screen to the review with the real checks.

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const SETUP = "http://127.0.0.1:4191/setup";
const FILE = join(homedir(), ".sdlc-hub-test", "gitlab.json");
const gitlab = process.env.HUB_GITLAB_IT === "1" && existsSync(FILE);
const ownerToken = gitlab ? (JSON.parse(readFileSync(FILE, "utf8")) as { ownerToken: string }).ownerToken : "";

const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

for (const vp of [
  { name: "desktop", width: 1366, height: 860 },
  { name: "phone", width: 390, height: 800 },
]) {
  test(`setup at ${vp.name} width: both hosts need a sign-in`, async ({ browser }) => {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(SETUP);
    await expect(page.locator("h1")).toHaveText("Set up SDLC Hub for your project");
    expect(await overflow(page)).toBe(0);
    await page.click("#b-begin");
    await expect(page.locator("h2")).toHaveText("Where does your code live?");
    await page.click("#c-host-github");
    await expect(page.locator("#f-address")).toHaveValue("github.com");
    await expect(page.locator("#github-perms")).toContainText("Workflows");
    await expect(page.locator(".signin a")).toHaveAttribute("href", "https://github.com/settings/personal-access-tokens/new");
    await expect(page.locator("#b-next")).toBeDisabled();
    await expect(page.locator(".foot .why")).toHaveText("Sign in to continue");
    await expect(page.locator("#b-signin")).toBeDisabled();
    expect(await overflow(page)).toBe(0);
    await page.click("#c-host-gitlab");
    await expect(page.locator("#b-next")).toBeDisabled();
    await expect(page.locator(".foot .why")).toHaveText("Sign in to continue");
    await expect(page.locator("#b-signin")).toBeDisabled();
    expect(await overflow(page)).toBe(0);
    expect(errors).toEqual([]);
  });
}

test.describe("with the local GitLab", () => {
  test.skip(!gitlab, "needs HUB_GITLAB_IT=1 and e2e/gitlab/bootstrap.mjs");

  for (const vp of [
    { name: "desktop", width: 1366, height: 860 },
    { name: "phone", width: 390, height: 800 },
  ]) {
    test(`every screen to the review at ${vp.name} width`, async ({ browser }) => {
      const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      const bad: string[] = [];
      const check = async (where: string) => {
        const o = await overflow(page);
        if (o > 0) bad.push(`${where}: ${o}px`);
      };
      await page.goto(SETUP);
      await page.click("#b-begin");
      await page.fill("#f-address", "http://localhost:8929");
      await page.fill("#f-token", "not-a-token");
      await page.click("#b-signin");
      await expect(page.locator(".signin .err")).toContainText("refused the token");
      await page.fill("#f-token", ownerToken);
      await page.click("#b-signin");
      await expect(page.locator(".signed")).toContainText("Signed in as nazar.t");
      await check("screen 1");
      await page.click("#b-next");

      await expect(page.locator("h2")).toHaveText("Which repositories does the hub work with?");
      await page.fill("#f-t1-repo", "backend");
      await expect(page.locator(".foot .why")).toHaveText("Two rows use the same repository");
      await page.fill("#f-t1-repo", "product-specs");
      await expect(page.locator(".foot .why")).toHaveText("A team repository cannot be the specifications repository");
      await page.fill("#f-t1-repo", "web-admin");
      await check("screen 2");
      await page.click("#b-next");

      await expect(page.locator("h2")).toHaveText("Project and issue tracker");
      await page.click("#c-tracker-jira");
      await expect(page.locator(".foot .why")).toHaveText("Jira needs an address and a project key");
      await page.click("#c-tracker-none");
      await check("screen 3");
      await page.click("#b-next");

      await expect(page.locator("h2")).toHaveText("Assistants and engine");
      await check("screen 4");
      await page.click("#b-next");

      await expect(page.locator("h2")).toHaveText("Review and install");
      await expect(page.locator('[data-check="owner"]')).toContainText("You are an Owner of shop");
      await expect(page.locator('[data-check="runner"] .pill')).toHaveText("ok");
      await expect(page.locator("#b-install")).toBeEnabled();
      await page.locator("details.more summary").click();
      await expect(page.locator("details.more")).toContainText(".hub/config.yaml");
      await check("review");
      expect(errors).toEqual([]);
      expect(bad).toEqual([]);
    });
  }
});
