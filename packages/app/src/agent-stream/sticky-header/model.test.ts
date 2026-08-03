import { describe, expect, it } from "vitest";
import type { StreamItem } from "@/types/stream";
import {
  findLastIndexStartedAbove,
  isStickyPreviewTrackedItem,
  selectStickyConversationPreviews,
  selectStickyIncomingRole,
  shouldTrackStickyPreviews,
  STICKY_BLOCK_BAR_REVEAL_DISTANCE,
  STICKY_BLOCK_REVEAL_DISTANCE,
  STICKY_CONVERSATION_MAX_ROW_HEIGHT,
  STICKY_CONVERSATION_ROW_HEIGHT,
  STICKY_PIN_TEXT_INSET,
  stickyBlockBarRevealProgress,
  stickyBlockRevealProgress,
  stickyConversationPushOffset,
  stickyConversationFoldOffset,
  toStickyPreviewText,
  trackStickyPreviewGenerationStarts,
} from "./model";

function userMessage(id: string, text: string, timestamp: number): StreamItem {
  return { kind: "user_message", id, text, timestamp: new Date(timestamp) };
}

function assistantMessage(id: string, text: string, timestamp: number): StreamItem {
  return {
    kind: "assistant_message",
    id,
    text,
    timestamp: new Date(timestamp),
  };
}

function assistantBlock(
  id: string,
  text: string,
  timestamp: number,
  blockGroupId: string,
  blockIndex: number,
): StreamItem {
  return {
    kind: "assistant_message",
    id,
    text,
    timestamp: new Date(timestamp),
    blockGroupId,
    blockIndex,
  };
}

function todoList(id: string, timestamp: number): StreamItem {
  return {
    kind: "todo_list",
    id,
    items: [],
    provider: "claude",
    timestamp: new Date(timestamp),
  };
}

const conversation: StreamItem[] = [
  userMessage("u1", "first question", 1),
  assistantMessage("a1", "first answer", 2),
  todoList("t1", 3),
  userMessage("u2", "second question", 4),
  assistantMessage("a2", "second answer", 5),
];

describe("selectStickyConversationPreviews", () => {
  it("returns nothing until a message has scrolled above the viewport", () => {
    expect(
      selectStickyConversationPreviews({
        tail: conversation,
        head: [],
        aboveViewportItemId: null,
        mode: "user-and-ai",
      }),
    ).toEqual({ user: null, assistant: null });
  });

  it("tracks each side independently at the boundary", () => {
    const previews = selectStickyConversationPreviews({
      tail: conversation,
      head: [],
      aboveViewportItemId: "u2",
      mode: "user-and-ai",
    });
    expect(previews.user?.itemId).toBe("u2");
    expect(previews.assistant?.itemId).toBe("a1");
  });

  it("advances the assistant side without moving the user side", () => {
    const previews = selectStickyConversationPreviews({
      tail: conversation,
      head: [],
      aboveViewportItemId: "a2",
      mode: "user-and-ai",
    });
    expect(previews.user?.itemId).toBe("u2");
    expect(previews.assistant?.itemId).toBe("a2");
  });

  it("keeps the response start when later text moves into the live head", () => {
    const previews = selectStickyConversationPreviews({
      tail: conversation,
      head: [assistantMessage("live", "streaming so far", 6)],
      aboveViewportItemId: "live",
      mode: "user-and-ai",
    });
    expect(previews.assistant).toEqual({
      itemId: "a2",
      text: "second answer",
      timestamp: 5,
      sequence: 4,
    });
    expect(previews.user?.itemId).toBe("u2");
    // The block stacks in conversation order, so which of the pair came first
    // has to survive selection: here the prompt is above the response.
    expect(previews.user!.sequence).toBeLessThan(previews.assistant!.sequence);
  });

  it("orders the pair by the conversation when the prompt is the newer one", () => {
    const previews = selectStickyConversationPreviews({
      tail: conversation,
      head: [],
      // Reading a long prompt: the response pinned with it is the previous
      // turn's, which sits above the prompt on screen.
      aboveViewportItemId: "u2",
      mode: "user-and-ai",
    });
    expect(previews.user?.itemId).toBe("u2");
    expect(previews.assistant?.itemId).toBe("a1");
    expect(previews.assistant!.sequence).toBeLessThan(previews.user!.sequence);
  });

  it("pins the first block of a split response, not the block being read", () => {
    // A long response is promoted into one item per markdown block. Scrolling
    // deep into it lands the boundary on a later block; the pin must still show
    // the message's beginning.
    const split: StreamItem[] = [
      userMessage("u1", "explain", 1),
      assistantBlock("g:block:0", "First, the overview.", 2, "g", 0),
      assistantBlock("g:block:1", "Second, the details.", 3, "g", 1),
      assistantBlock("g:block:2", "Third, the caveats.", 4, "g", 2),
    ];
    const atLastBlock = selectStickyConversationPreviews({
      tail: split,
      head: [],
      aboveViewportItemId: "g:block:2",
      mode: "user-and-ai",
    });
    expect(atLastBlock.assistant?.itemId).toBe("g:block:0");
    expect(atLastBlock.assistant?.text).toBe("First, the overview.");
    // The pin does not move as the reader crosses block boundaries within the
    // same response.
    const atMiddleBlock = selectStickyConversationPreviews({
      tail: split,
      head: [],
      aboveViewportItemId: "g:block:1",
      mode: "user-and-ai",
    });
    expect(atMiddleBlock.assistant?.itemId).toBe("g:block:0");
  });

  it("keeps the actual response start across tool calls and later text sections", () => {
    const split: StreamItem[] = [
      userMessage("u1", "explain", 1),
      assistantMessage("a1", "I will inspect it.", 2),
      todoList("tool", 3),
      assistantMessage("a2", "Here is the result.", 4),
    ];
    const previews = selectStickyConversationPreviews({
      tail: split,
      head: [],
      aboveViewportItemId: "a2",
      mode: "user-and-ai",
    });
    expect(previews.assistant?.itemId).toBe("a1");
    expect(previews.assistant?.text).toBe("I will inspect it.");
  });

  it("drops the assistant side in user-only mode", () => {
    const previews = selectStickyConversationPreviews({
      tail: conversation,
      head: [],
      aboveViewportItemId: "a2",
      mode: "user",
    });
    expect(previews.user?.itemId).toBe("u2");
    expect(previews.assistant).toBeNull();
  });

  it("returns nothing when the header is off", () => {
    expect(
      selectStickyConversationPreviews({
        tail: conversation,
        head: [],
        aboveViewportItemId: "a2",
        mode: "off",
      }),
    ).toEqual({ user: null, assistant: null });
  });

  it("skips messages whose preview text is empty", () => {
    const previews = selectStickyConversationPreviews({
      tail: [userMessage("u1", "kept", 1), userMessage("u2", "   \n ", 2)],
      head: [],
      aboveViewportItemId: "u2",
      mode: "user-and-ai",
    });
    expect(previews.user?.itemId).toBe("u1");
  });

  it("returns nothing when the boundary item is no longer in the stream", () => {
    expect(
      selectStickyConversationPreviews({
        tail: conversation,
        head: [],
        aboveViewportItemId: "gone",
        mode: "user-and-ai",
      }),
    ).toEqual({ user: null, assistant: null });
  });
});

describe("trackStickyPreviewGenerationStarts", () => {
  it("keeps the earliest timestamp seen for a streaming response", () => {
    const startsByItemId = new Map<string, number>();
    trackStickyPreviewGenerationStarts({
      items: [assistantMessage("live", "Refac", 1000)],
      startsByItemId,
    });
    trackStickyPreviewGenerationStarts({
      items: [assistantMessage("live", "Refactoring the parser", 4000)],
      startsByItemId,
    });
    expect(startsByItemId.get("live")).toBe(1000);
  });

  it("freezes the sticky timestamp while the text keeps growing", () => {
    const startsByItemId = new Map<string, number>([["live", 1000]]);
    const previews = selectStickyConversationPreviews({
      tail: [userMessage("u1", "go", 900)],
      head: [assistantMessage("live", "Refactoring the parser", 4000)],
      aboveViewportItemId: "live",
      mode: "user-and-ai",
      generationStartByItemId: startsByItemId,
    });
    expect(previews.assistant).toEqual({
      itemId: "live",
      text: "Refactoring the parser",
      timestamp: 1000,
      sequence: 1,
    });
  });
});

describe("toStickyPreviewText", () => {
  it("stops at the first explicit line break", () => {
    expect(toStickyPreviewText("  refactor\r\n\r\n  the parser  ")).toBe("refactor");
    expect(toStickyPreviewText("\nsecond line")).toBe("");
  });
});

describe("stickyConversationFoldOffset", () => {
  it("places the fold after the measured upper row", () => {
    const previews = {
      user: { itemId: "u", text: "one", timestamp: 1, sequence: 1 },
      assistant: { itemId: "a", text: "answer", timestamp: 2, sequence: 2 },
    };
    expect(
      stickyConversationFoldOffset("user-and-ai", previews, {
        user: STICKY_CONVERSATION_MAX_ROW_HEIGHT,
      }),
    ).toBe(STICKY_CONVERSATION_MAX_ROW_HEIGHT + STICKY_PIN_TEXT_INSET);
  });
});

describe("isStickyPreviewTrackedItem", () => {
  it("tracks only user and assistant messages", () => {
    expect(isStickyPreviewTrackedItem(userMessage("u", "a", 1))).toBe(true);
    expect(isStickyPreviewTrackedItem(assistantMessage("a", "b", 1))).toBe(true);
    expect(isStickyPreviewTrackedItem(todoList("t", 1))).toBe(false);
  });
});

describe("shouldTrackStickyPreviews", () => {
  it("is off only for the off mode", () => {
    expect(shouldTrackStickyPreviews("off")).toBe(false);
    expect(shouldTrackStickyPreviews("user")).toBe(true);
    expect(shouldTrackStickyPreviews("user-and-ai")).toBe(true);
  });
});

describe("findLastIndexStartedAbove", () => {
  const tops = [0, 10, 40, 90, 150];
  const getTop = (index: number) => tops[index];

  it("returns -1 at the very top, where nothing has started above", () => {
    expect(findLastIndexStartedAbove({ count: tops.length, getTop, viewportTop: -1 })).toBe(-1);
  });

  it("names the row the reader is inside, not the one they finished", () => {
    // Row 3 spans [90, 150) and the top edge sits at 100: the reader is inside
    // row 3, so row 3 is the answer even though row 2 is the last one they
    // scrolled fully past.
    expect(
      findLastIndexStartedAbove({
        count: tops.length,
        getTop,
        viewportTop: 100,
      }),
    ).toBe(3);
  });

  it("switches to a row the moment its top edge reaches the viewport top", () => {
    expect(findLastIndexStartedAbove({ count: tops.length, getTop, viewportTop: 89 })).toBe(2);
    expect(findLastIndexStartedAbove({ count: tops.length, getTop, viewportTop: 90 })).toBe(3);
  });

  it("returns the last row once everything is above", () => {
    expect(
      findLastIndexStartedAbove({
        count: tops.length,
        getTop,
        viewportTop: 999,
      }),
    ).toBe(4);
  });

  it("handles an empty list", () => {
    expect(findLastIndexStartedAbove({ count: 0, getTop, viewportTop: 10 })).toBe(-1);
  });
});

const PUSH_BASE = {
  incomingRole: "user" as const,
  previews: {
    user: { itemId: "u1", text: "q", timestamp: 1, sequence: 1 },
    assistant: { itemId: "a1", text: "a", timestamp: 2, sequence: 2 },
  },
  mode: "user-and-ai" as const,
};

describe("stickyConversationPushOffset", () => {
  it("pushes a wrapped oldest row through its measured height", () => {
    expect(
      stickyConversationPushOffset({
        ...PUSH_BASE,
        distanceToFold: 0,
        rowHeights: { user: STICKY_CONVERSATION_MAX_ROW_HEIGHT },
      }),
    ).toBe(STICKY_CONVERSATION_MAX_ROW_HEIGHT);
  });

  it("leaves the block still while nothing is due at the fold", () => {
    expect(stickyConversationPushOffset({ ...PUSH_BASE, distanceToFold: null })).toBe(0);
    expect(
      stickyConversationPushOffset({
        ...PUSH_BASE,
        distanceToFold: STICKY_CONVERSATION_ROW_HEIGHT * 3,
      }),
    ).toBe(0);
    expect(
      stickyConversationPushOffset({
        ...PUSH_BASE,
        distanceToFold: STICKY_CONVERSATION_ROW_HEIGHT,
      }),
    ).toBe(0);
  });

  it("rides up by exactly what the incoming line has closed", () => {
    expect(
      stickyConversationPushOffset({
        ...PUSH_BASE,
        distanceToFold: STICKY_CONVERSATION_ROW_HEIGHT - 10,
      }),
    ).toBe(10);
    expect(stickyConversationPushOffset({ ...PUSH_BASE, distanceToFold: 1 })).toBe(
      STICKY_CONVERSATION_ROW_HEIGHT - 1,
    );
  });

  it("stops one row up, where the swap takes over", () => {
    expect(stickyConversationPushOffset({ ...PUSH_BASE, distanceToFold: 0 })).toBe(
      STICKY_CONVERSATION_ROW_HEIGHT,
    );
    expect(stickyConversationPushOffset({ ...PUSH_BASE, distanceToFold: -200 })).toBe(
      STICKY_CONVERSATION_ROW_HEIGHT,
    );
  });

  it("sits still when the incoming message only replaces the lower line", () => {
    // Newest pinned is the response; another response swaps into its row and the
    // prompt above it does not move.
    expect(
      stickyConversationPushOffset({
        ...PUSH_BASE,
        incomingRole: "assistant",
        distanceToFold: 4,
      }),
    ).toBe(0);
  });

  it("sits still for a response arriving in user-only mode", () => {
    expect(
      stickyConversationPushOffset({
        ...PUSH_BASE,
        mode: "user",
        incomingRole: "assistant",
        distanceToFold: 4,
      }),
    ).toBe(0);
    expect(
      stickyConversationPushOffset({
        ...PUSH_BASE,
        mode: "user",
        incomingRole: "user",
        distanceToFold: 4,
      }),
    ).toBe(STICKY_CONVERSATION_ROW_HEIGHT - 4);
  });
});

describe("stickyBlockRevealProgress", () => {
  it("is nothing at rest, before any content has scrolled under the fold", () => {
    expect(stickyBlockRevealProgress(0)).toBe(0);
    expect(stickyBlockRevealProgress(-5)).toBe(0);
    expect(stickyBlockRevealProgress(Number.NaN)).toBe(0);
  });

  it("tracks the scroll straight across and holds full past the span", () => {
    // Linear: a quarter of the way is a quarter of the way.
    expect(stickyBlockRevealProgress(STICKY_BLOCK_REVEAL_DISTANCE / 4)).toBeCloseTo(0.25);
    expect(stickyBlockRevealProgress(STICKY_BLOCK_REVEAL_DISTANCE / 2)).toBeCloseTo(0.5);
    expect(stickyBlockRevealProgress(STICKY_BLOCK_REVEAL_DISTANCE)).toBe(1);
    expect(stickyBlockRevealProgress(STICKY_BLOCK_REVEAL_DISTANCE * 4)).toBe(1);
  });
});

describe("stickyBlockBarRevealProgress", () => {
  it("is nothing until the response has scrolled past the fold", () => {
    expect(stickyBlockBarRevealProgress(0)).toBe(0);
    expect(stickyBlockBarRevealProgress(-5)).toBe(0);
    expect(stickyBlockBarRevealProgress(Number.NaN)).toBe(0);
  });

  it("wipes across its own span, slower than the surface reveal", () => {
    // Per-response, and a good deal longer than the surface span so the underline
    // is a gradual wipe rather than a flash.
    expect(STICKY_BLOCK_BAR_REVEAL_DISTANCE).toBeGreaterThan(STICKY_BLOCK_REVEAL_DISTANCE);
    expect(stickyBlockBarRevealProgress(STICKY_BLOCK_BAR_REVEAL_DISTANCE / 2)).toBeCloseTo(0.5);
    expect(stickyBlockBarRevealProgress(STICKY_BLOCK_BAR_REVEAL_DISTANCE)).toBe(1);
    expect(stickyBlockBarRevealProgress(STICKY_BLOCK_BAR_REVEAL_DISTANCE * 4)).toBe(1);
  });
});

describe("selectStickyIncomingRole", () => {
  it("names the first tracked message still below the fold", () => {
    expect(
      selectStickyIncomingRole({
        tail: conversation,
        head: [],
        aboveViewportItemId: "u2",
      }),
    ).toBe("assistant");
    expect(
      selectStickyIncomingRole({
        tail: conversation,
        head: [],
        aboveViewportItemId: "a1",
      }),
    ).toBe("user");
  });

  it("skips untracked items on the way down", () => {
    expect(
      selectStickyIncomingRole({
        tail: conversation,
        head: [],
        aboveViewportItemId: "a1",
      }),
    ).toBe("user");
  });

  it("is null at the newest message, and with no boundary at all", () => {
    expect(
      selectStickyIncomingRole({
        tail: conversation,
        head: [],
        aboveViewportItemId: "a2",
      }),
    ).toBeNull();
    expect(
      selectStickyIncomingRole({
        tail: conversation,
        head: [],
        aboveViewportItemId: null,
      }),
    ).toBeNull();
    expect(
      selectStickyIncomingRole({
        tail: conversation,
        head: [],
        aboveViewportItemId: "gone",
      }),
    ).toBeNull();
  });

  it("does not treat a live-head response fragment as an incoming message", () => {
    expect(
      selectStickyIncomingRole({
        tail: conversation,
        head: [assistantMessage("live", "streaming", 6)],
        aboveViewportItemId: "a2",
      }),
    ).toBeNull();
  });

  it("skips renderer fragments when naming the next actual message", () => {
    const split: StreamItem[] = [
      userMessage("u1", "one", 1),
      assistantMessage("a1", "first paragraph", 2),
      todoList("tool", 3),
      assistantMessage("a2", "later paragraph", 4),
      userMessage("u2", "two", 5),
    ];
    expect(
      selectStickyIncomingRole({
        tail: split,
        head: [],
        aboveViewportItemId: "a1",
      }),
    ).toBe("user");
  });
});
