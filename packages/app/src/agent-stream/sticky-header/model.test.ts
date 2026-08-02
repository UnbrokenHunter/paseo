import { describe, expect, it } from "vitest";
import type { StreamItem } from "@/types/stream";
import {
  findLastIndexStartedAbove,
  isStickyPreviewTrackedItem,
  selectStickyConversationPreviews,
  shouldTrackStickyPreviews,
  toStickyPreviewText,
  trackStickyPreviewGenerationStarts,
} from "./model";

function userMessage(id: string, text: string, timestamp: number): StreamItem {
  return { kind: "user_message", id, text, timestamp: new Date(timestamp) };
}

function assistantMessage(id: string, text: string, timestamp: number): StreamItem {
  return { kind: "assistant_message", id, text, timestamp: new Date(timestamp) };
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

  it("continues chronologically into the live head", () => {
    const previews = selectStickyConversationPreviews({
      tail: conversation,
      head: [assistantMessage("live", "streaming so far", 6)],
      aboveViewportItemId: "live",
      mode: "user-and-ai",
    });
    expect(previews.assistant).toEqual({
      itemId: "live",
      text: "streaming so far",
      timestamp: 6,
      sequence: 5,
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
  it("collapses a message to a single line", () => {
    expect(toStickyPreviewText("  refactor\n\n  the parser  ")).toBe("refactor the parser");
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
    expect(findLastIndexStartedAbove({ count: tops.length, getTop, viewportTop: 100 })).toBe(3);
  });

  it("switches to a row the moment its top edge reaches the viewport top", () => {
    expect(findLastIndexStartedAbove({ count: tops.length, getTop, viewportTop: 89 })).toBe(2);
    expect(findLastIndexStartedAbove({ count: tops.length, getTop, viewportTop: 90 })).toBe(3);
  });

  it("returns the last row once everything is above", () => {
    expect(findLastIndexStartedAbove({ count: tops.length, getTop, viewportTop: 999 })).toBe(4);
  });

  it("handles an empty list", () => {
    expect(findLastIndexStartedAbove({ count: 0, getTop, viewportTop: 10 })).toBe(-1);
  });
});
