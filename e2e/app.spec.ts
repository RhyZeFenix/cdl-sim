import { expect, test } from "@playwright/test";

test("sims a week and shows results on the schedule", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Next:")).toBeVisible();
  await page.getByRole("button", { name: "Sim week" }).click();
  await expect(page.getByText("Stage 1 Qualifiers · Week 2").first()).toBeVisible({ timeout: 30_000 });
  // Week 1 fixtures now carry scores.
  await expect(page.locator(".fixture .score").first()).toHaveText(/\d/);
});

test("a watched match stays hidden and plays map by map", async ({ page }) => {
  await page.goto("/");
  await page.locator(".watch-toggle").first().click();
  await expect(page.getByText("1 on your watchlist")).toBeVisible();
  await page.getByRole("button", { name: "Sim week" }).click();
  const banner = page.locator(".matchday");
  await expect(banner).toContainText("Ready to watch", { timeout: 30_000 });
  await banner.getByRole("button", { name: "Watch", exact: true }).click();
  await expect(page.getByText("Watching live")).toBeVisible();
  // The current map is live; later maps don't show a result yet.
  await expect(page.locator(".mapcard .mscore").first()).toHaveText("LIVE");
  await expect(page.locator(".mapcard .mscore").nth(1)).toHaveText("—");
});

test("GM mode opens the Office with all its tabs", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New season" }).click();
  await page.locator(".setup").getByRole("button", { name: "GM", exact: true }).click();
  await page.getByRole("button", { name: "Start season" }).click();
  const tabs = page.locator(".subtabs");
  await expect(tabs).toBeVisible();
  for (const [tab, heading] of [
    ["This week", "This week's prep"],
    ["Calendar", "Season calendar"],
    ["Market", "Contracts"],
    ["Staff", "Your staff"],
    ["Academy", "Challengers prospects"],
    ["Awards", "MVP race"],
    ["Career", "Achievements"],
  ]) {
    await tabs.getByRole("tab", { name: tab }).click();
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  }
});

test("a share link rebuilds the same season at the same point", async ({ page }) => {
  await page.goto("/#s=2026&seed=e2e-share&step=2");
  await expect(page.getByText("Opened a shared season at step 2")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("seed e2e-share")).toBeVisible();
  await expect(page.getByText("Stage 1 Qualifiers · Week 3").first()).toBeVisible();
});

test("the map editor draws a layout and checks it", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Maps" }).click();
  await page.getByRole("button", { name: "Map editor" }).click();
  await expect(page.locator(".editor-canvas")).toBeVisible();
  await page.getByRole("button", { name: "Check" }).click();
  await expect(page.getByText("Everything is on open ground and reachable")).toBeVisible();
});
