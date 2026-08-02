import { test } from "./fixtures";
import { expect } from "@playwright/test";
import { awaitAssistantMessage, expectAgentIdle } from "./helpers/agent-stream";
import { startRunningMockAgent, submitMessage } from "./helpers/composer";

// A pinned message keeps the exact footprint it has in the conversation: the
// prompt's pin ends where its bubble ends, the response's pin starts where its
// text starts. The sticky column re-creates the list's padding and the stream
// row's wrapper inset by hand, so this guards the two from drifting apart.
// The prompts are long enough to be collapsible, which reveals the arrows —
// they hang in the margins and must not push a pin off its rail.
test("pinned messages sit on the same rails as real ones", async ({ page }) => {
  test.setTimeout(300_000);
  const filler = "with enough words to make the prompt tall enough to fold".repeat(6);
  const agent = await startRunningMockAgent(page, {
    prefix: "sticky-align-",
    model: "ten-second-stream",
    prompt: `First prompt for the alignment probe, ${filler}.`,
  });
  try {
    await awaitAssistantMessage(page);
    await expectAgentIdle(page, 60_000).catch(() => undefined);
    await submitMessage(page, `Second prompt for the alignment probe, ${filler}.`);
    await expectAgentIdle(page, 90_000).catch(() => undefined);
    await page.waitForTimeout(3000);

    await page.mouse.move(700, 400);
    await page.mouse.wheel(0, -700);
    await page.waitForTimeout(900);
    await expect(page.getByTestId("sticky-conversation-header")).toBeVisible();

    // Reveal the user arrow (its wrapper carries the opacity), then measure.
    // The assistant side is not asserted: which response is pinned here is a
    // short one that cannot be folded, so it gets no arrow at all.
    await page.getByTestId("sticky-conversation-preview-user").hover();
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const el = document.querySelector('[data-testid="sticky-conversation-collapse-user"]');
          return el?.parentElement ? getComputedStyle(el.parentElement).opacity : null;
        }),
      )
      .toBe("1");

    const rails = await page.evaluate(() => {
      const first = (selector: string) => document.querySelector(selector);
      const box = (node: Element | null) => (node ? node.getBoundingClientRect() : null);
      // The user bubble is the padded box inside the message row.
      const userMessage = first('[data-testid="user-message"]');
      const userBubble = userMessage?.querySelector(":scope > * > *") ?? null;
      const assistantMessage = first('[data-testid="assistant-message"]');
      const userPin = first('[data-testid="sticky-conversation-preview-user"]');
      const assistantPin = first('[data-testid="sticky-conversation-preview-assistant"]');
      const header = first('[data-testid="sticky-conversation-header"]');
      const scroll = first('[data-testid="agent-chat-scroll"]');
      return {
        userBubbleRight: box(userBubble)?.right ?? null,
        userPinRight: box(userPin)?.right ?? null,
        assistantLeft: box(assistantMessage)?.left ?? null,
        assistantPinLeft: box(assistantPin)?.left ?? null,
        userPinWidth: box(userPin)?.width ?? null,
        // The row the pin caps against: the pin's own parent.
        rowWidth: userPin?.parentElement
          ? userPin.parentElement.getBoundingClientRect().width
          : null,
        blockHeight: header && scroll ? box(header)!.bottom - box(scroll)!.top : null,
      };
    });

    expect(rails.userPinRight).toBe(rails.userBubbleRight);
    expect(rails.assistantPinLeft).toBe(rails.assistantLeft);
    // A prompt longer than the cap stops at three quarters of the column and
    // fades, rather than running the width of the conversation.
    expect(rails.userPinWidth).toBeCloseTo(rails.rowWidth! * 0.75, 0);
    // The rule under the last pinned line is the boundary the swap fires at, so
    // the block has to be exactly the fold the strategies offset to: two rows.
    expect(rails.blockHeight).toBe(68);
  } finally {
    await agent.cleanup();
  }
});
