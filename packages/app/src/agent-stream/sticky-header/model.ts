import type { StickyConversationHeaderMode } from "@/hooks/use-settings";
import type { StreamItem } from "@/types/stream";

/**
 * Height of one pinned row. A row keeps it even when that side has nothing to
 * pin, so the side that does never moves as the other comes and goes.
 */
export const STICKY_CONVERSATION_ROW_HEIGHT = 34;

export interface StickyConversationPreview {
  itemId: string;
  text: string;
  timestamp: number;
}

export interface StickyConversationPreviews {
  user: StickyConversationPreview | null;
  assistant: StickyConversationPreview | null;
}

export const EMPTY_STICKY_CONVERSATION_PREVIEWS: StickyConversationPreviews = {
  user: null,
  assistant: null,
};

/** Only these kinds can ever fill a sticky slot, so viewports track nothing else. */
export function isStickyPreviewTrackedItem(item: StreamItem): boolean {
  return item.kind === "user_message" || item.kind === "assistant_message";
}

export function shouldTrackStickyPreviews(mode: StickyConversationHeaderMode): boolean {
  return mode !== "off";
}

export function toStickyPreviewText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Streaming rewrites an assistant item's timestamp on every chunk, so the first
 * time an item shows up in the live head is the closest thing to a generation
 * start time. Recording it here keeps the sticky timestamp from ticking upward
 * while the response is still being written.
 */
export function trackStickyPreviewGenerationStarts(input: {
  items: readonly StreamItem[];
  startsByItemId: Map<string, number>;
}): void {
  for (const item of input.items) {
    if (item.kind !== "assistant_message") {
      continue;
    }
    const timestamp = item.timestamp.getTime();
    const existing = input.startsByItemId.get(item.id);
    if (existing === undefined || timestamp < existing) {
      input.startsByItemId.set(item.id, timestamp);
    }
  }
}

interface SelectStickyConversationPreviewsInput {
  /** Committed history, oldest first. */
  tail: readonly StreamItem[];
  /** In-flight turn items, oldest first. Continues `tail` chronologically. */
  head: readonly StreamItem[];
  /** Latest tracked item the viewport reports as fully scrolled above the top edge. */
  aboveViewportItemId: string | null;
  mode: StickyConversationHeaderMode;
  /** Generation-start times collected by `trackStickyPreviewGenerationStarts`. */
  generationStartByItemId?: ReadonlyMap<string, number>;
}

/**
 * Pick the newest user and assistant message at or before the above-viewport
 * boundary. The walk runs backwards from the boundary and stops as soon as both
 * slots are filled, so a live turn flushing every 48ms does not rescan history.
 */
export function selectStickyConversationPreviews(
  input: SelectStickyConversationPreviewsInput,
): StickyConversationPreviews {
  const { tail, head, aboveViewportItemId, mode, generationStartByItemId } = input;
  if (mode === "off" || !aboveViewportItemId) {
    return EMPTY_STICKY_CONVERSATION_PREVIEWS;
  }

  const total = tail.length + head.length;
  const itemAt = (index: number): StreamItem | undefined =>
    index < tail.length ? tail[index] : head[index - tail.length];

  let boundaryIndex = -1;
  for (let index = total - 1; index >= 0; index -= 1) {
    if (itemAt(index)?.id === aboveViewportItemId) {
      boundaryIndex = index;
      break;
    }
  }
  if (boundaryIndex < 0) {
    return EMPTY_STICKY_CONVERSATION_PREVIEWS;
  }

  const wantsAssistant = mode === "user-and-ai";
  let user: StickyConversationPreview | null = null;
  let assistant: StickyConversationPreview | null = null;

  for (let index = boundaryIndex; index >= 0; index -= 1) {
    if (user && (assistant || !wantsAssistant)) {
      break;
    }
    const item = itemAt(index);
    if (!item) {
      continue;
    }
    if (item.kind === "user_message" && !user) {
      user = toPreview(item.id, item.text, item.timestamp.getTime());
    } else if (wantsAssistant && item.kind === "assistant_message" && !assistant) {
      const generationStart = generationStartByItemId?.get(item.id);
      assistant = toPreview(
        item.id,
        item.text,
        generationStart === undefined
          ? item.timestamp.getTime()
          : Math.min(generationStart, item.timestamp.getTime()),
      );
    }
  }

  return { user, assistant };
}

function toPreview(
  itemId: string,
  rawText: string,
  timestamp: number,
): StickyConversationPreview | null {
  const text = toStickyPreviewText(rawText);
  if (!text) {
    return null;
  }
  return { itemId, text, timestamp };
}

interface FindLastIndexStartedAboveInput {
  count: number;
  /** Top edge of row `index` in scroll-content coordinates. Must not decrease. */
  getTop: (index: number) => number;
  /** Scroll-content coordinate of the viewport's top edge. */
  viewportTop: number;
}

/**
 * Index of the last row that *starts* above the viewport top, or -1 when none
 * do — the message the reader is currently inside.
 *
 * Waiting for a row's bottom edge instead is what made the header feel a
 * message behind: a response tall enough to fill the screen has not finished
 * scrolling past, so the header went on describing the previous turn for as
 * long as you were reading the current one, and the collapse control on it
 * acted on that previous turn too.
 *
 * Binary search keeps a scroll handler O(log n) even when the whole
 * conversation is above the fold.
 */
export function findLastIndexStartedAbove(input: FindLastIndexStartedAboveInput): number {
  let low = 0;
  let high = input.count - 1;
  let result = -1;
  while (low <= high) {
    const middle = (low + high) >>> 1;
    if (input.getTop(middle) <= input.viewportTop) {
      result = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return result;
}
