import type { StickyConversationHeaderMode } from "@/hooks/use-settings";
import type { AssistantMessageItem, StreamItem } from "@/types/stream";

/** Line height of a pinned line. Matches the message text it stands in for. */
export const STICKY_PIN_LINE_HEIGHT = 22;
/**
 * Space above and below a pinned line, which is the prompt bubble's own padding
 * (`userMessageStylesheet.bubble` in components/message.tsx). A pinned prompt is
 * shown in its bubble, and the bubble has to be the size it is in the
 * conversation or the pin reads as a different, thinner thing.
 *
 * The response side takes the same padding even though it has no bubble to
 * fill. Both rows have to put their text at the same depth: the fold is a text
 * position, and it decides which message pins, which decides which side takes
 * the lower row. A depth that varied by side would feed back into itself and
 * oscillate across the handoff.
 */
export const STICKY_PIN_VERTICAL_PADDING = 16;

/**
 * Height of one pinned row — one line in its bubble. A row keeps it even when
 * that side has nothing to pin, so the side that does never moves as the other
 * comes and goes.
 */
export const STICKY_CONVERSATION_ROW_HEIGHT =
  STICKY_PIN_LINE_HEIGHT + STICKY_PIN_VERTICAL_PADDING * 2;

/**
 * Where a pinned line's text sits inside its row. The pin fills the row, so the
 * text sits its own padding down from the row's top.
 */
export const STICKY_PIN_TEXT_INSET = STICKY_PIN_VERTICAL_PADDING;

/**
 * Where the handoff happens, measured down from the viewport's top edge.
 *
 * This is the y a pinned line's text occupies, so a message swaps into its pin
 * at the moment its own first line is already sitting there — the text does not
 * move, it just stops scrolling. VS Code's sticky scroll takes a line into a
 * slot on the same test (`topOfElement > topOfBeginningLine`, where
 * `topOfElement` is the slot's own position), which is what makes a sticky line
 * read as the line itself held in place rather than a copy of it.
 *
 * The incoming message always lands in the block's last row, so the offset is
 * that row's top plus the inset. Sized for a full block rather than the rows
 * that currently have something to pin: the boundary this offset picks is what
 * decides which rows fill, so a height that followed the filled rows would feed
 * back into itself and oscillate across the row that is entering.
 */
export function stickyConversationFoldOffset(mode: StickyConversationHeaderMode): number {
  if (mode === "off") {
    return 0;
  }
  const lastRowTop = mode === "user-and-ai" ? STICKY_CONVERSATION_ROW_HEIGHT : 0;
  return lastRowTop + STICKY_PIN_TEXT_INSET;
}

/**
 * Whether the message arriving at the fold will take the top line's place.
 *
 * A message only pushes when it displaces the line above it. Two responses in a
 * row do not: the second replaces the first in the lower row and the prompt
 * above them stays exactly where it is, so riding the block up would carry that
 * prompt off screen and then redraw it back. In user-only mode the same holds
 * for anything that is not a prompt — a response arriving at the fold changes
 * nothing about what is pinned.
 */
function willDisplaceTopLine(input: {
  incomingRole: "user" | "assistant" | null;
  previews: StickyConversationPreviews;
  mode: StickyConversationHeaderMode;
}): boolean {
  const { incomingRole, previews, mode } = input;
  if (incomingRole === null) {
    return false;
  }
  if (mode !== "user-and-ai") {
    return incomingRole === "user";
  }
  const newest =
    (previews.user?.sequence ?? -1) >= (previews.assistant?.sequence ?? -1) ? "user" : "assistant";
  return incomingRole !== newest;
}

/**
 * Role of the first tracked message still below the fold — the one on its way
 * in. Null when the boundary is the newest tracked message there is.
 */
export function selectStickyIncomingRole(input: {
  tail: readonly StreamItem[];
  head: readonly StreamItem[];
  aboveViewportItemId: string | null;
}): "user" | "assistant" | null {
  const { tail, head, aboveViewportItemId } = input;
  if (!aboveViewportItemId) {
    return null;
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
    return null;
  }
  for (let index = boundaryIndex + 1; index < total; index += 1) {
    const item = itemAt(index);
    if (item?.kind === "user_message") {
      return "user";
    }
    if (item?.kind === "assistant_message") {
      return "assistant";
    }
  }
  return null;
}

/**
 * How far to slide the pinned block up, given the distance from the fold to the
 * first line of the message that has not pinned yet.
 *
 * A message does not replace the one above it in place. As the next message's
 * line comes down onto the fold, the block moves up with it at exactly the
 * scroll's own rate, so the line that has been pinned longest leaves the top of
 * the screen the way any other content would. It is fully gone at the moment the
 * incoming line lands on the fold, which is the moment the swap fires — the
 * block redraws one row shorter at the top and one row longer at the bottom, and
 * nothing on screen moves.
 *
 * 0 when nothing is coming, or when what is coming does not displace the top
 * line: the block sits still and the lower row swaps in place.
 */
export function stickyConversationPushOffset(input: {
  /** Distance from the fold to the incoming message's first line, or null. */
  distanceToFold: number | null;
  incomingRole: "user" | "assistant" | null;
  previews: StickyConversationPreviews;
  mode: StickyConversationHeaderMode;
}): number {
  const { distanceToFold } = input;
  if (distanceToFold === null || !Number.isFinite(distanceToFold)) {
    return 0;
  }
  if (!willDisplaceTopLine(input)) {
    return 0;
  }
  const push = STICKY_CONVERSATION_ROW_HEIGHT - distanceToFold;
  if (push <= 0) {
    return 0;
  }
  return Math.min(push, STICKY_CONVERSATION_ROW_HEIGHT);
}

export interface StickyConversationPreview {
  itemId: string;
  text: string;
  timestamp: number;
  /**
   * Position in the stream. The block stacks in conversation order, so the
   * message that comes second takes the lower row — the one the fold sits on,
   * and so the only row a message ever swaps into. The pair is not always in
   * the same order: reading a response, the prompt above it came first; reading
   * a long prompt, the response pinned with it is the previous turn's, above.
   */
  sequence: number;
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
      user = toPreview(item.id, item.text, item.timestamp.getTime(), index);
    } else if (wantsAssistant && item.kind === "assistant_message" && !assistant) {
      // A long response is split into one item per markdown block, so scrolling
      // down through it would otherwise pin each block in turn. Pin the group's
      // first block instead — the beginning of the message, held for its whole
      // length.
      const groupHead = resolveAssistantGroupHead(itemAt, index, item);
      const generationStart = generationStartByItemId?.get(groupHead.item.id);
      assistant = toPreview(
        groupHead.item.id,
        groupHead.item.text,
        generationStart === undefined
          ? groupHead.item.timestamp.getTime()
          : Math.min(generationStart, groupHead.item.timestamp.getTime()),
        groupHead.index,
      );
    }
  }

  return { user, assistant };
}

/**
 * Walk back to the first block of a block-split assistant message, given one of
 * its blocks. Blocks of one response share a `blockGroupId` and sit contiguously
 * (see `promoteCompletedAssistantBlocks` in types/stream.ts); a message that was
 * never split has no group and is its own head.
 */
function resolveAssistantGroupHead(
  itemAt: (index: number) => StreamItem | undefined,
  index: number,
  item: AssistantMessageItem,
): { item: AssistantMessageItem; index: number } {
  const groupId = item.blockGroupId;
  if (groupId === undefined) {
    return { item, index };
  }
  let headItem = item;
  let headIndex = index;
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const candidate = itemAt(cursor);
    if (candidate?.kind !== "assistant_message" || candidate.blockGroupId !== groupId) {
      break;
    }
    headItem = candidate;
    headIndex = cursor;
  }
  return { item: headItem, index: headIndex };
}

function toPreview(
  itemId: string,
  rawText: string,
  timestamp: number,
  sequence: number,
): StickyConversationPreview | null {
  const text = toStickyPreviewText(rawText);
  if (!text) {
    return null;
  }
  return { itemId, text, timestamp, sequence };
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
