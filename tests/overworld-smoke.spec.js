const { test, expect } = require("@playwright/test");

const STORAGE_KEY = "block_island_phase1_save_v1";

async function openFreshGame(page) {
  await page.goto("/");
  await page.evaluate((storageKey) => {
    window.localStorage.removeItem(storageKey);
  }, STORAGE_KEY);
  await page.reload();
}

async function readSave(page) {
  return page.evaluate((storageKey) => {
    const raw = window.localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) : null;
  }, STORAGE_KEY);
}

async function holdKey(page, code, durationMs) {
  await page.keyboard.down(code);
  await page.waitForTimeout(durationMs);
  await page.keyboard.up(code);
}

async function moveToGarden(page) {
  await holdKey(page, "ArrowRight", 1600);
  await expect(page.locator("#world-location-value")).toContainText("Home Garden");
}

async function moveToBed(page) {
  await holdKey(page, "ArrowLeft", 1700);
  await expect(page.locator("#world-location-value")).toContainText("Housing");
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

  const save = await readSave(page);

  expect(save).not.toBeNull();
  expect(save.world.overworld.currentMapId).toBe("starter_town_slice");
  expect(save.world.overworld.player.x).toBeGreaterThan(230);
});

test("bed interaction advances the day and creates a save", async ({ page }) => {
  await openFreshGame(page);

  const initialDate = await page.locator("#top-date-value").textContent();

  await page.keyboard.press("e");

  await expect(page.locator("#top-date-value")).not.toHaveText(initialDate || "");

  const save = await readSave(page);

  expect(save).not.toBeNull();
  expect(save.time.day).toBeGreaterThan(1);
});

test("garden crops grow across sleeps and harvest into inventory", async ({ page }) => {
  await openFreshGame(page);

  await moveToGarden(page);

  await page.keyboard.press("Digit1");
  await expect(page.locator("#world-tool-value")).toHaveText("Hoe");
  await page.keyboard.press("e");
  await expect(page.locator("#world-feedback-value")).toContainText("till");

  await page.keyboard.press("Digit3");
  await expect(page.locator("#world-tool-value")).toHaveText("Turnip Seeds");
  await page.keyboard.press("e");
  await expect(page.locator("#world-feedback-value")).toContainText("plant");

  await page.keyboard.press("Digit2");
  await expect(page.locator("#world-tool-value")).toHaveText("Watering Can");
  await page.keyboard.press("e");
  await expect(page.locator("#world-feedback-value")).toContainText("water");

  let dateLabel = await page.locator("#top-date-value").textContent();
  await moveToBed(page);
  await page.keyboard.press("e");
  await expect(page.locator("#top-date-value")).not.toHaveText(dateLabel || "");

  await moveToGarden(page);
  await page.keyboard.press("Digit2");
  await page.keyboard.press("e");
  await expect(page.locator("#world-feedback-value")).toContainText("water");

  dateLabel = await page.locator("#top-date-value").textContent();
  await moveToBed(page);
  await page.keyboard.press("e");
  await expect(page.locator("#top-date-value")).not.toHaveText(dateLabel || "");

  await moveToGarden(page);
  await page.keyboard.press("e");
  await expect(page.locator("#world-feedback-value")).toContainText("harvest");
  await expect(page.locator("#world-bag-value")).toContainText("Turnips 1");

  await page.reload();

  const save = await readSave(page);

  expect(save).not.toBeNull();
  expect(save.player.inventory.turnip).toBe(1);
  expect(save.player.inventory.turnip_seeds).toBe(5);
  expect(save.world.overworld.mapStates.starter_town_slice.farmPlots.home_plot_3.tilled).toBe(true);
  expect(save.world.overworld.mapStates.starter_town_slice.farmPlots.home_plot_3.cropId).toBe("");
});
