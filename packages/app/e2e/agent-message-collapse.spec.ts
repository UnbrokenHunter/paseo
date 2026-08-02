import { test, expect } from "./fixtures";
import { awaitAssistantMessage } from "./helpers/agent-stream";
import { startRunningMockAgent } from "./helpers/composer";

// Tall enough to be worth collapsing — a message has to roughly halve its own
// height before the control is offered at all.
const PROMPT = [
  "Collapse me from the conversation.",
  "This prompt runs over several lines",
  "so the collapsed bubble saves real height,",
  "which is the only case where",
  "the collapse control is offered at all.",
].join("\n");

test.describe("Message collapse", () => {
  test("collapses and expands a user prompt in place", async ({ page }) => {
    test.setTimeout(120_000);
    const agent = await startRunningMockAgent(page, {
      prefix: "collapse-user-",
      model: "one-minute-stream",
      prompt: PROMPT,
    });
    try {
      const userMessage = page.getByTestId("user-message").filter({ hasText: PROMPT }).first();
      await expect(userMessage).toBeVisible({ timeout: 30_000 });

      await userMessage.hover();
      await page.getByTestId("collapse-message-user").first().click();

      const collapsed = page.getByTestId("collapsed-message-user").first();
      await expect(collapsed).toBeVisible();
      await expect(page.getByTestId("user-message").filter({ hasText: PROMPT })).toHaveCount(0);
      // The preview keeps the real start of the prompt rather than a label.
      await expect(collapsed).toContainText("Collapse me");

      await page.getByTestId("expand-message-user").first().click();
      await expect(page.getByTestId("user-message").filter({ hasText: PROMPT })).toHaveCount(1);
      await expect(page.getByTestId("collapsed-message-user")).toHaveCount(0);

      // The stub itself opens too, not only its arrow.
      await userMessage.hover();
      await page.getByTestId("collapse-message-user").first().click();
      await expect(page.getByTestId("collapsed-message-user").first()).toBeVisible();
      await page.getByTestId("collapsed-message-body-user").first().click();
      await expect(page.getByTestId("collapsed-message-user")).toHaveCount(0);
    } finally {
      await agent.cleanup();
    }
  });

  test("withholds the control from a prompt that cannot get shorter", async ({ page }) => {
    test.setTimeout(120_000);
    const agent = await startRunningMockAgent(page, {
      prefix: "collapse-short-",
      model: "one-minute-stream",
      prompt: "One line.",
    });
    try {
      const userMessage = page.getByTestId("user-message").filter({ hasText: "One line." }).first();
      await expect(userMessage).toBeVisible({ timeout: 30_000 });
      await userMessage.hover();
      await expect(page.getByTestId("collapse-message-user")).toHaveCount(0);
      // The sticky header must not offer it either — it cannot measure the
      // message itself, so it reads what the message published.
      if ((await page.getByTestId("sticky-conversation-header").count()) > 0) {
        await expect(page.getByTestId("sticky-conversation-collapse-user")).toHaveCount(0);
      }
    } finally {
      await agent.cleanup();
    }
  });

  test("pressing the stub reveals the message, the arrow leaves the view alone", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const agent = await startRunningMockAgent(page, {
      prefix: "collapse-reveal-",
      model: "one-minute-stream",
      prompt: PROMPT,
    });
    try {
      const userMessage = page.getByTestId("user-message").filter({ hasText: PROMPT }).first();
      await expect(userMessage).toBeVisible({ timeout: 30_000 });
      await userMessage.hover();
      await page.getByTestId("collapse-message-user").first().click();
      await expect(page.getByTestId("collapsed-message-user").first()).toBeVisible();

      // Scroll the stub away from the top, then open it from its own body.
      await page.mouse.move(700, 400);
      await page.mouse.wheel(0, 400);
      await page.waitForTimeout(600);
      await page.getByTestId("collapsed-message-user").first().scrollIntoViewIfNeeded();
      await page.getByTestId("collapsed-message-body-user").first().click();
      await expect(page.getByTestId("collapsed-message-user")).toHaveCount(0);
      await page.waitForTimeout(1200);

      const offsetFromTop = await page.evaluate(() => {
        const scroll = document.querySelector('[data-testid="agent-chat-scroll"]');
        const message = document.querySelector('[data-testid="user-message"]');
        if (!(scroll instanceof HTMLElement) || !(message instanceof HTMLElement)) return null;
        return message.getBoundingClientRect().top - scroll.getBoundingClientRect().top;
      });
      expect(offsetFromTop).not.toBeNull();
      expect(Math.abs(offsetFromTop ?? 0)).toBeLessThan(60);

      // The arrow puts it back without moving the view.
      await userMessage.hover();
      await page.getByTestId("collapse-message-user").first().click();
      await expect(page.getByTestId("collapsed-message-user").first()).toBeVisible();
      const before = await page.evaluate(() => {
        const scroll = document.querySelector('[data-testid="agent-chat-scroll"]');
        return scroll instanceof HTMLElement ? scroll.scrollTop : null;
      });
      await page.getByTestId("expand-message-user").first().click();
      await expect(page.getByTestId("collapsed-message-user")).toHaveCount(0);
      await page.waitForTimeout(1200);
      const after = await page.evaluate(() => {
        const scroll = document.querySelector('[data-testid="agent-chat-scroll"]');
        return scroll instanceof HTMLElement ? scroll.scrollTop : null;
      });
      expect(after).toBe(before);
    } finally {
      await agent.cleanup();
    }
  });

  test("collapses a streaming response without stopping generation", async ({ page }) => {
    test.setTimeout(120_000);
    const agent = await startRunningMockAgent(page, {
      prefix: "collapse-streaming-",
      model: "one-minute-stream",
      prompt: "Stream for the collapse test.",
    });
    try {
      await awaitAssistantMessage(page);
      const assistantMessage = page.getByTestId("assistant-message").last();
      await assistantMessage.hover();
      await page.getByTestId("collapse-message-assistant").last().click();

      const collapsed = page.getByTestId("collapsed-message-assistant").last();
      await expect(collapsed).toBeVisible();
      // Still generating: the turn is running and the preview keeps changing.
      await expect(page.getByRole("button", { name: /stop|cancel/i }).first()).toBeVisible();
      const firstPreview = (await collapsed.textContent()) ?? "";
      await expect
        .poll(async () => (await collapsed.textContent()) ?? "", { timeout: 30_000 })
        .not.toBe(firstPreview);

      await page.getByTestId("expand-message-assistant").last().click();
      await expect(page.getByTestId("collapsed-message-assistant")).toHaveCount(0);
    } finally {
      await agent.cleanup();
    }
  });
});
