import type { ProviderUsage } from "@getpaseo/protocol/messages";
import { expect, test, type Page } from "./fixtures";
import { gotoAppShell, openSettings } from "./helpers/app";
import { expectComposerVisible } from "./helpers/composer";
import { openAgentRoute, seedMockAgentWorkspace } from "./helpers/mock-agent";
import { installProviderUsageFixture } from "./helpers/provider-usage";
import { openSettingsSection } from "./helpers/settings";

const MOBILE_VIEWPORT = { width: 390, height: 844 };
const ROTATION_INTERVAL_MS = 8_000;

/**
 * Reset times render as a countdown from now, so fixtures have to be relative or the
 * assertion changes meaning as the clock moves. The countdown floors to whole hours
 * and seeding a workspace takes a minute or two, so aim at the middle of the hour —
 * anything less and the test reads an hour lower than it set up.
 */
function inHours(hours: number): string {
  return new Date(Date.now() + (hours + 0.5) * 3_600_000).toISOString();
}

function mockProvider(overrides: Partial<ProviderUsage> = {}): ProviderUsage {
  return {
    providerId: "mock",
    displayName: "Mock provider",
    status: "available",
    planLabel: "Test plan",
    windows: [],
    ...overrides,
  };
}

async function openMockAgent(page: Page) {
  await page.setViewportSize(MOBILE_VIEWPORT);
  const session = await seedMockAgentWorkspace({
    repoPrefix: "provider-usage-indicator-",
    title: "Provider usage indicator e2e",
    initialPrompt: "emit 1 coalesced agent stream update for the provider usage indicator.",
  });
  await openAgentRoute(page, session);
  await expectComposerVisible(page);
  await expect(page.getByTestId("context-window-meter")).toBeVisible({ timeout: 30_000 });
  return session;
}

const barLabel = (page: Page) => page.getByTestId("provider-usage-bar-label");

test.describe("provider usage indicator", () => {
  test("reads out the remaining percentage and the reset countdown", async ({ page }) => {
    test.setTimeout(180_000);
    await installProviderUsageFixture(page, [
      {
        fetchedAt: new Date().toISOString(),
        providers: [
          mockProvider({
            windows: [{ id: "session", label: "Session", usedPct: 42, resetsAt: inHours(3) }],
          }),
        ],
      },
    ]);

    const session = await openMockAgent(page);
    try {
      await expect(barLabel(page)).toHaveText("58% remaining · resets in 3h", {
        timeout: 30_000,
      });
    } finally {
      await session.cleanup();
    }
  });

  test("rotates through the limits, closest to exhaustion first", async ({ page }) => {
    test.setTimeout(180_000);
    await installProviderUsageFixture(page, [
      {
        fetchedAt: new Date().toISOString(),
        providers: [
          mockProvider({
            windows: [
              // Declared least-used first, so an unsorted bar would show this one.
              { id: "weekly", label: "Weekly", usedPct: 30 },
              { id: "session", label: "Session", usedPct: 80 },
            ],
          }),
        ],
      },
    ]);

    const session = await openMockAgent(page);
    try {
      await expect(barLabel(page)).toHaveText("20% remaining", { timeout: 30_000 });
      await expect(barLabel(page)).toHaveText("70% remaining", {
        timeout: ROTATION_INTERVAL_MS * 2,
      });
      // And back round, so this is a rotation rather than a one-time swap.
      await expect(barLabel(page)).toHaveText("20% remaining", {
        timeout: ROTATION_INTERVAL_MS * 2,
      });
    } finally {
      await session.cleanup();
    }
  });

  test("holds the limit closest to exhaustion once rotation is switched off", async ({ page }) => {
    test.setTimeout(180_000);
    await installProviderUsageFixture(page, [
      {
        fetchedAt: new Date().toISOString(),
        providers: [
          mockProvider({
            windows: [
              { id: "weekly", label: "Weekly", usedPct: 30 },
              { id: "session", label: "Session", usedPct: 80 },
            ],
          }),
        ],
      },
    ]);

    await gotoAppShell(page);
    await openSettings(page);
    await openSettingsSection(page, "appearance");
    const toggle = page.getByRole("switch", { name: "Rotate provider usage limits" });
    await expect(toggle).toBeVisible();
    await expect(toggle).toBeChecked();
    await toggle.click();
    await expect(toggle).not.toBeChecked();

    const session = await openMockAgent(page);
    try {
      await expect(barLabel(page)).toHaveText("20% remaining", { timeout: 30_000 });
      // Long enough that a rotation would have fired twice over.
      await page.waitForTimeout(ROTATION_INTERVAL_MS * 2);
      await expect(barLabel(page)).toHaveText("20% remaining");
    } finally {
      await session.cleanup();
    }
  });

  test("says a locally hosted model has no limits to report", async ({ page }) => {
    test.setTimeout(180_000);
    await installProviderUsageFixture(page, [
      {
        fetchedAt: new Date().toISOString(),
        providers: [
          mockProvider({
            displayName: "Local Qwen",
            status: "unavailable",
            unmetered: true,
            planLabel: null,
            sourceLabel: "localhost:11434",
          }),
        ],
      },
    ]);

    const session = await openMockAgent(page);
    try {
      await expect(barLabel(page)).toHaveText("No usage limits", { timeout: 30_000 });

      await page.getByTestId("context-window-meter").hover();
      const card = page.getByTestId("provider-usage-tooltip-card");
      await expect(card).toBeVisible({ timeout: 10_000 });
      await expect(card.getByText("localhost:11434", { exact: false })).toBeVisible();
    } finally {
      await session.cleanup();
    }
  });

  test("says usage is unavailable when the provider reports no limits", async ({ page }) => {
    test.setTimeout(180_000);
    await installProviderUsageFixture(page, [
      {
        fetchedAt: new Date().toISOString(),
        providers: [
          mockProvider({ status: "unavailable", planLabel: null, error: "No quota API" }),
        ],
      },
    ]);

    const session = await openMockAgent(page);
    try {
      await expect(barLabel(page)).toHaveText("Usage unavailable", { timeout: 30_000 });
    } finally {
      await session.cleanup();
    }
  });

  test("shows no usage bar at all when the host cannot report usage", async ({ page }) => {
    test.setTimeout(180_000);
    const usageFixture = await installProviderUsageFixture(
      page,
      [{ fetchedAt: new Date().toISOString(), providers: [mockProvider()] }],
      { supported: false },
    );

    const session = await openMockAgent(page);
    try {
      // The meter stays — it is still the context-window ring — but it says nothing
      // about usage, and never asks a host that cannot answer.
      await expect(page.getByTestId("context-window-meter")).toBeVisible();
      await expect(barLabel(page)).toHaveCount(0);
      expect(usageFixture.requestCount()).toBe(0);
    } finally {
      await session.cleanup();
    }
  });

  test("keeps the context-window numbers at the top of the popover", async ({ page }) => {
    test.setTimeout(180_000);
    await installProviderUsageFixture(page, [
      {
        fetchedAt: new Date().toISOString(),
        providers: [mockProvider({ windows: [{ id: "session", label: "Session", usedPct: 42 }] })],
      },
    ]);

    const session = await openMockAgent(page);
    try {
      await page.getByTestId("context-window-meter").hover();
      const card = page.getByTestId("provider-usage-tooltip-card");
      await expect(card).toBeVisible({ timeout: 30_000 });

      // The popover is the context tooltip with usage appended, not usage alone.
      await expect(page.getByText("Context window", { exact: true })).toBeVisible();
      await expect(page.getByText(/% used$/)).toBeVisible();
      await expect(page.getByText(/tokens$/)).toBeVisible();
    } finally {
      await session.cleanup();
    }
  });

  test("pins the popover open on press and releases it on a second press", async ({ page }) => {
    test.setTimeout(180_000);
    await installProviderUsageFixture(page, [
      {
        fetchedAt: new Date().toISOString(),
        providers: [mockProvider({ windows: [{ id: "session", label: "Session", usedPct: 42 }] })],
      },
    ]);

    const session = await openMockAgent(page);
    try {
      const meter = page.getByTestId("context-window-meter");
      const card = page.getByTestId("provider-usage-tooltip-card");
      await expect(barLabel(page)).toHaveText("58% remaining", { timeout: 30_000 });

      await meter.click();
      await expect(card).toBeVisible({ timeout: 10_000 });

      // Pinned, so moving the pointer away leaves it open.
      await page.mouse.move(0, 0);
      await expect(card).toBeVisible();

      // A second press releases the pin. The popover stays up while the pointer is
      // still on the meter — that is plain hover — but it now closes on hover out,
      // which is the difference the pin makes.
      await meter.click();
      await page.mouse.move(0, 0);
      await expect(card).toHaveCount(0);
    } finally {
      await session.cleanup();
    }
  });
});
