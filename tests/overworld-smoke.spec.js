const { test, expect } = require("@playwright/test");

const STORAGE_KEY = "block_island_phase1_save_v1";

async function openFreshGame(page) {
  await page.goto("/");
  await page.evaluate((storageKey) => {
    window.localStorage.removeItem(storageKey);
  }, STORAGE_KEY);
  await page.reload();
}

test("boots into the overworld without runtime errors", async ({ page }) => {
  const consoleErrors = [];
  const pageErrors = [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  await openFreshGame(page);

  await expect(page.getByRole("heading", { name: /Block Island/i })).toBeVisible();
  await expect(page.locator("#world-canvas")).toBeVisible();
  await expect(page.locator("#world-clock-value")).toHaveText(/\d{2}:\d{2}/);
  await expect(page.locator("#world-location-value")).toContainText("Housing");

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test("movement is persisted into the saved overworld state", async ({ page }) => {
  await openFreshGame(page);
  await expect(page.locator("#world-location-value")).toBeVisible();

  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(700);
  await page.keyboard.up("ArrowRight");

  await page.reload();

  const save = await page.evaluate((storageKey) => {
    const raw = window.localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) : null;
  }, STORAGE_KEY);

  expect(save).not.toBeNull();
  expect(save.world.overworld.currentMapId).toBe("starter_town_slice");
  expect(save.world.overworld.player.x).toBeGreaterThan(230);
});

test("bed interaction advances the day and creates a save", async ({ page }) => {
  await openFreshGame(page);

  const initialDate = await page.locator("#top-date-value").textContent();

  await page.keyboard.press("e");

  await expect(page.locator("#top-date-value")).not.toHaveText(initialDate || "");

  const save = await page.evaluate((storageKey) => {
    const raw = window.localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) : null;
  }, STORAGE_KEY);

  expect(save).not.toBeNull();
  expect(save.time.day).toBeGreaterThan(1);
});
