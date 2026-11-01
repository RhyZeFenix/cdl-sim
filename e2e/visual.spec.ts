// Visual regression: screenshots of the main pages for a fixed season (a share link
// with a seed and a step count, so every run renders the same thing), compared with the
// committed baselines in e2e/visual.spec.ts-snapshots/. Baselines are per platform; the
// "Visual baselines" workflow regenerates the Linux ones that CI compares against.
import { existsSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

const SHARE = "/#s=2025&seed=visual-1&step=6";

async function open(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
  await page.goto(SHARE);
  await expect(page.getByText("Next:")).toBeVisible({ timeout: 60_000 });
  // Nothing time-dependent on screen: hide the autosave time, the seed line and progress.
  await page.addStyleTag({ content: ".progress, .autosaved { visibility: hidden !important; }" });
}

const tab = (page: Page, name: string) => page.getByRole("tab", { name, exact: true }).click();

const shot = { maxDiffPixelRatio: 0.01, animations: "disabled" as const };

test.describe("visual", () => {
  // A missing baseline fails the run, so CI waits until the Linux ones are committed.
  test.skip(
    !!process.env.CI && !existsSync(`e2e/visual.spec.ts-snapshots/standings-desktop-${process.platform}.png`),
    "No baselines for this platform yet: run the Visual baselines workflow",
  );

  test("standings", async ({ page }) => {
    await open(page);
    await tab(page, "Standings");
    await expect(page.locator("main")).toHaveScreenshot("standings.png", shot);
  });

  test("schedule", async ({ page }) => {
    await open(page);
    await tab(page, "Schedule");
    await expect(page.locator("main")).toHaveScreenshot("schedule.png", shot);
  });

  test("compare", async ({ page }) => {
    await open(page);
    await tab(page, "Compare");
    await expect(page.locator("main")).toHaveScreenshot("compare.png", shot);
  });

  test("real map data", async ({ page }) => {
    await open(page);
    await tab(page, "Maps");
    await page.getByRole("button", { name: "Real map data" }).click();
    await expect(page.locator("main")).toHaveScreenshot("map-data.png", shot);
  });
});
