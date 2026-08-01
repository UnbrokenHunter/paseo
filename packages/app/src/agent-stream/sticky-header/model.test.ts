import { describe, expect, it } from "vitest";
import type { StreamItem } from "@/types/stream";
import {
  findLastIndexFullyAbove,
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
    });
    expect(previews.user?.itemId).toBe("u2");
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

describe("findLastIndexFullyAbove", () => {
  const bottoms = [10, 40, 90, 150, 220];
  const getBottom = (index: number) => bottoms[index];

  it("returns -1 when nothing has scrolled past", () => {
    expect(findLastIndexFullyAbove({ count: bottoms.length, getBottom, viewportTop: 0 })).toBe(-1);
  });

  it("finds the last row whose bottom edge cleared the top", () => {
    expect(findLastIndexFullyAbove({ count: bottoms.length, getBottom, viewportTop: 95 })).toBe(2);
  });

  it("includes a row whose bottom edge is exactly at the top", () => {
    expect(findLastIndexFullyAbove({ count: bottoms.length, getBottom, viewportTop: 90 })).toBe(2);
  });

  it("returns the last row once everything is above", () => {
    expect(findLastIndexFullyAbove({ count: bottoms.length, getBottom, viewportTop: 999 })).toBe(4);
  });

  it("handles an empty list", () => {
    expect(findLastIndexFullyAbove({ count: 0, getBottom, viewportTop: 10 })).toBe(-1);
  });
});
