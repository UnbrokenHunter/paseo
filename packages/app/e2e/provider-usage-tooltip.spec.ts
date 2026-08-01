import { expect, test, type Page } from "./fixtures";
import { expectComposerVisible } from "./helpers/composer";
import { openAgentRoute, seedMockAgentWorkspace } from "./helpers/mock-agent";
import { installProviderUsageFixture } from "./helpers/provider-usage";

const MOBILE_VIEWPORT = { width: 390, height: 844 };

async function openMockAgent(page: Page) {
  await page.setViewportSize(MOBILE_VIEWPORT);
  const session = await seedMockAgentWorkspace({
    repoPrefix: "provider-usage-tooltip-",
    title: "Provider usage tooltip e2e",
    initialPrompt: "emit 1 coalesced agent stream update for provider usage tooltip.",
  });
  await openAgentRoute(page, session);
  await expectComposerVisible(page);
  await expect(page.getByTestId("context-window-meter")).toBeVisible({ timeout: 30_000 });
  return session;
}

// Usage fetching is always-on while the composer is mounted, so the first request
// lands before any hover. Assertions scope to the tooltip card because the composer
// renders the same numbers in its own usage bar.
test.describe("provider usage tooltip", () => {
  test("fetches usage with the composer and renders the active provider in the tooltip", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const usageFixture = await installProviderUsageFixture(page, [
      {
        fetchedAt: "2026-06-19T00:00:00.000Z",
        providers: [
          {
            providerId: "mock",
            displayName: "Mock provider",
            status: "available",
            planLabel: "Test plan",
            windows: [
              {
                id: "session",
                label: "Session",
                usedPct: 42,
                remainingPct: 58,
                resetsAt: "2026-06-19T05:00:00.000Z",
              },
            ],
          },
        ],
      },
    ]);
    const session = await openMockAgent(page);
    try {
      await usageFixture.waitForRequestCount(1);

      await page.getByTestId("context-window-meter").hover();
      const card = page.getByTestId("provider-usage-tooltip-card");
      await expect(card).toBeVisible({ timeout: 10_000 });

      await expect(card.getByText("Mock provider", { exact: true })).toBeVisible();
      await expect(card.getByText("Test plan")).toBeVisible();
      await expect(card.getByText("Session", { exact: true })).toBeVisible();
      await expect(card.getByText("42%")).toBeVisible();
    } finally {
      await session.cleanup();
    }
  });

  test("refreshes usage again each time the tooltip is shown", async ({ page }) => {
    test.setTimeout(180_000);
    const usageFixture = await installProviderUsageFixture(page, [
      {
        fetchedAt: "2026-06-19T00:00:00.000Z",
        providers: [
          {
            providerId: "mock",
            displayName: "Mock provider",
            status: "available",
            planLabel: "Test plan",
            windows: [{ id: "session", label: "Session", usedPct: 41 }],
          },
        ],
      },
      {
        fetchedAt: "2026-06-19T00:01:00.000Z",
        providers: [
          {
            providerId: "mock",
            displayName: "Mock provider",
            status: "available",
            planLabel: "Test plan",
            windows: [{ id: "session", label: "Session", usedPct: 64 }],
          },
        ],
      },
      {
        fetchedAt: "2026-06-19T00:02:00.000Z",
        providers: [
          {
            providerId: "mock",
            displayName: "Mock provider",
            status: "available",
            planLabel: "Test plan",
            windows: [{ id: "session", label: "Session", usedPct: 77 }],
          },
        ],
      },
    ]);
    const session = await openMockAgent(page);
    try {
      const meter = page.getByTestId("context-window-meter");
      const card = page.getByTestId("provider-usage-tooltip-card");

      await usageFixture.waitForRequestCount(1);

      await meter.hover();
      await usageFixture.waitForRequestCount(2);
      await expect(card.getByText("64%")).toBeVisible({ timeout: 10_000 });

      await page.mouse.move(0, 0);
      await expect(card).toHaveCount(0);

      await meter.hover();
      await usageFixture.waitForRequestCount(3);
      expect(usageFixture.requestCount()).toBe(3);
      await expect(card.getByText("77%")).toBeVisible();
    } finally {
      await session.cleanup();
    }
  });
});
