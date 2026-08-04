import { expect, test } from "../support/fixtures";
import { gotoAppShell, openSettings } from "../support/helpers/app";
import { openSettingsSection } from "../support/helpers/settings";

const NAMED_THEMES = ["Light", "Dark", "Zinc", "Midnight", "Claude", "Ghostty"] as const;

async function selectTheme(page: import("@playwright/test").Page, label: string): Promise<void> {
  await page.getByLabel(/^Theme:/).click();
  await page.getByText(label, { exact: true }).last().click();
}

async function expectFavicon(page: import("@playwright/test").Page, path: string): Promise<void> {
  const favicon = page.locator('link[rel="icon"]');
  await expect
    .poll(async () => new URL((await favicon.getAttribute("href")) ?? "", page.url()).pathname)
    .toBe(path);
  expect((await page.request.get(new URL(path, page.url()).toString())).ok()).toBe(true);
}

test("favicon follows every theme and the system color scheme", async ({ page }) => {
  await gotoAppShell(page);
  await openSettings(page);
  await openSettingsSection(page, "appearance");

  for (const label of NAMED_THEMES) {
    await selectTheme(page, label);
    await expectFavicon(page, `/app-icons/favicon-${label.toLowerCase()}.png`);
  }

  await page.emulateMedia({ colorScheme: "dark" });
  await selectTheme(page, "System");
  await expectFavicon(page, "/app-icons/favicon-dark.png");

  await page.emulateMedia({ colorScheme: "light" });
  await expectFavicon(page, "/app-icons/favicon-light.png");
});
