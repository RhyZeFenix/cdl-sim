import { expect, test } from "@playwright/test";

test("no sideways scrolling on a phone", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Sim week" }).click();
  await expect(page.getByText("Stage 1 Qualifiers · Week 2").first()).toBeVisible({ timeout: 30_000 });
  for (const tab of ["Schedule", "Standings", "Records", "About"]) {
    await page.getByRole("tab", { name: tab }).click();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${tab} scrolls sideways`).toBeLessThanOrEqual(1);
  }
});
