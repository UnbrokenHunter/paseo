import { test } from "./fixtures";
import { expect } from "@playwright/test";
import { awaitAssistantMessage, expectAgentIdle } from "./helpers/agent-stream";
import { startRunningMockAgent, submitMessage } from "./helpers/composer";

/**
 * Measures the box of an element's first line of text, not the element's own
 * box. Everything these tests assert is about where the text sits: a pinned
 * message is supposed to be the message's line held in place, so the padding
 * and margins around it are exactly what must not be compared.
 */
interface Line {
  top: number;
  left: number;
  right: number;
}

const FIRST_LINE_HELPER = `
  function firstLine(node) {
    if (!node) { return null; }
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    let text = walker.nextNode();
    while (text && !text.nodeValue.trim()) { text = walker.nextNode(); }
    if (!text) { return null; }
    const range = document.createRange();
    range.selectNodeContents(text);
    const rect = range.getBoundingClientRect();
    return { top: rect.top, left: rect.left, right: rect.right };
  }
`;

// A pinned message keeps the exact footprint it has in the conversation: the
// prompt's text ends where its bubble's text ends, the response's text starts
// where its own does. The sticky column re-creates the list's padding and the
// stream row's wrapper inset by hand, so this guards the two from drifting
// apart. The prompts are long enough to be collapsible, which reveals the
// arrows — they hang in the margins and must not push a pin off its rail.
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

    const rails = (await page.evaluate(`(() => {
      ${FIRST_LINE_HELPER}
      const first = (selector) => document.querySelector(selector);
      const userPin = first('[data-testid="sticky-conversation-preview-user"]');
      const userMessage = first('[data-testid="user-message"]');
      const header = first('[data-testid="sticky-conversation-header"]');
      const scroll = first('[data-testid="agent-chat-scroll"]');
      return {
        // Where the line starts. A range reports text geometry unclipped, so a
        // pinned line's right edge is where the whole message would end, not
        // where it is cut — only the left edge is comparable.
        userTextLeft: firstLine(userMessage).left,
        userPinTextLeft: firstLine(userPin).left,
        assistantTextLeft: firstLine(first('[data-testid="assistant-message"]')).left,
        assistantPinTextLeft: firstLine(
          first('[data-testid="sticky-conversation-preview-assistant"]'),
        ).left,
        userPinWidth: userPin.getBoundingClientRect().width,
        userBubbleWidth: userMessage.querySelector(":scope > * > *").getBoundingClientRect().width,
        // The bar, not the header: the header also holds the strip the cover
        // fades out over, which hangs below the block.
        blockHeight:
          header.firstElementChild.getBoundingClientRect().bottom -
          scroll.getBoundingClientRect().top,
        fadeHeight:
          header.getBoundingClientRect().bottom -
          header.firstElementChild.getBoundingClientRect().bottom,
      };
    })()`)) as {
      userTextLeft: number;
      userPinTextLeft: number;
      assistantTextLeft: number;
      assistantPinTextLeft: number;
      userPinWidth: number;
      userBubbleWidth: number;
      blockHeight: number;
      fadeHeight: number;
    };

    expect(rails.userPinTextLeft).toBeCloseTo(rails.userTextLeft, 0);
    expect(rails.assistantPinTextLeft).toBeCloseTo(rails.assistantTextLeft, 0);
    // A pin takes its message's own box, which is what keeps the text still.
    expect(rails.userPinWidth).toBeCloseTo(rails.userBubbleWidth, 0);
    // Two rows of pinned line, and the block covers exactly that.
    expect(rails.blockHeight).toBeCloseTo(68, 0);
    // Below it the cover runs out rather than stopping on an edge, so a message
    // passing under the block fades instead of being cut mid-glyph.
    expect(rails.fadeHeight).toBeCloseTo(16, 0);
  } finally {
    await agent.cleanup();
  }
});

// The handoff itself. A message should stop scrolling and start being pinned
// without its text moving: at the moment it pins, its own first line is already
// sitting on the line the pin occupies. This walks the scroll one pixel at a
// time across the swap and compares the line's position on either side of it.
test("a message pins without its text moving", async ({ page }) => {
  test.setTimeout(300_000);
  const filler = "with enough words to make this prompt run past a single line".repeat(4);
  const agent = await startRunningMockAgent(page, {
    prefix: "sticky-swap-",
    model: "ten-second-stream",
    prompt: `First prompt for the swap probe, ${filler}.`,
  });
  try {
    await awaitAssistantMessage(page);
    await expectAgentIdle(page, 60_000).catch(() => undefined);
    await submitMessage(page, `Second prompt for the swap probe, ${filler}.`);
    await expectAgentIdle(page, 90_000).catch(() => undefined);
    await page.waitForTimeout(3000);

    // Park the scroll just below the point where the last prompt hands off, so
    // the walk only has to cover the swap itself.
    const start = (await page.evaluate(`(() => {
      ${FIRST_LINE_HELPER}
      const scroll = document.querySelector('[data-testid="agent-chat-scroll"]');
      const messages = document.querySelectorAll('[data-testid="user-message"]');
      const target = messages[messages.length - 1];
      const line = firstLine(target);
      const scrollTop = scroll.scrollTop + line.top - scroll.getBoundingClientRect().top - 90;
      scroll.scrollTop = scrollTop;
      return { scrollTop, text: target.textContent.replace(/\\s+/g, " ").trim() };
    })()`)) as { scrollTop: number; text: string };

    const probe = `(() => {
      ${FIRST_LINE_HELPER}
      const pin = document.querySelector('[data-testid="sticky-conversation-preview-user"]');
      const pinText = pin ? pin.textContent.replace(/\\s+/g, " ").trim() : "";
      const messages = document.querySelectorAll('[data-testid="user-message"]');
      const target = messages[messages.length - 1];
      return {
        pinned: pinText.startsWith(TARGET_TEXT),
        pinLine: pin ? firstLine(pin) : null,
        realLine: target ? firstLine(target) : null,
      };
    })()`.replace("TARGET_TEXT", JSON.stringify(start.text.slice(0, 40)));

    let sawUnpinned = false;
    let previousReal: Line | null = null;
    let swap: { pin: Line; realBefore: Line } | null = null;
    for (let step = 0; step < 160 && !swap; step += 1) {
      await page.evaluate((top) => {
        const scroll = document.querySelector('[data-testid="agent-chat-scroll"]');
        if (scroll) {
          scroll.scrollTop = top;
        }
      }, start.scrollTop + step);
      await page.waitForTimeout(30);
      const reading = (await page.evaluate(probe)) as {
        pinned: boolean;
        pinLine: Line | null;
        realLine: Line | null;
      };
      if (!reading.pinned) {
        sawUnpinned = true;
        previousReal = reading.realLine;
        continue;
      }
      // Only the first pinned reading after an unpinned one is the handoff.
      if (sawUnpinned && reading.pinLine && previousReal) {
        swap = { pin: reading.pinLine, realBefore: previousReal };
      }
    }

    expect(swap, "the prompt never pinned across the walked range").not.toBeNull();
    // The scroll advanced one pixel between the two readings, so the real line
    // had one more pixel to travel before the pin took over from it. Within a
    // pixel of that, the line did not move: it stopped scrolling and started
    // being held, which is the whole point of the handoff.
    expect(Math.abs(swap!.pin.top - (swap!.realBefore.top - 1))).toBeLessThanOrEqual(1.5);
    expect(Math.abs(swap!.pin.left - swap!.realBefore.left)).toBeLessThanOrEqual(1.5);
  } finally {
    await agent.cleanup();
  }
});
