import type { StickyConversationHeaderMode } from "@/hooks/use-settings";
import type { StreamItem } from "@/types/stream";
import { buildStreamMessageGroups } from "../message-groups";

/** Line height of a pinned line. Matches the message text it stands in for. */
export const STICKY_PIN_LINE_HEIGHT = 22;
export const STICKY_PREVIEW_MAX_LINES = 2;
/** Compact spacing kept around a pinned assistant line. */
export const STICKY_PIN_VERTICAL_PADDING = 8;
/** Matches `userMessageStylesheet.bubble` so a pinned prompt keeps its whole bubble. */
export const STICKY_USER_PIN_VERTICAL_PADDING = 16;

/**
 * Height of one pinned row — one line in its bubble. A row keeps it even when
 * that side has nothing to pin, so the side that does never moves as the other
 * comes and goes.
 */
export const STICKY_CONVERSATION_ROW_HEIGHT =
  STICKY_PIN_LINE_HEIGHT + STICKY_PIN_VERTICAL_PADDING * 2;
export const STICKY_CONVERSATION_MAX_ROW_HEIGHT =
  STICKY_PIN_LINE_HEIGHT * STICKY_PREVIEW_MAX_LINES + STICKY_USER_PIN_VERTICAL_PADDING * 2;

export type StickyConversationRowHeights = Partial<Record<"user" | "assistant", number>>;

function stickyConversationRowHeight(
  role: "user" | "assistant",
  rowHeights?: StickyConversationRowHeights,
): number {
  const measured = rowHeights?.[role];
  return measured === undefined || !Number.isFinite(measured)
    ? STICKY_CONVERSATION_ROW_HEIGHT
    : Math.min(
        Math.max(measured, STICKY_CONVERSATION_ROW_HEIGHT),
        STICKY_CONVERSATION_MAX_ROW_HEIGHT,
      );
}

/**
 * Where a pinned line's text sits inside its row. The pin fills the row, so the
 * text sits its own padding down from the row's top.
 */
export const STICKY_PIN_TEXT_INSET = STICKY_PIN_VERTICAL_PADDING;

function stickyConversationTextInset(role: "user" | "assistant"): number {
  return role === "user" ? STICKY_USER_PIN_VERTICAL_PADDING : STICKY_PIN_TEXT_INSET;
}

/**
 * Scroll the block reveals across once the text has attached. The text is placed
 * coincident with the message and held; across this span the response's rule
 * extends from its edge and the surface fades in, both straight in step with the
 * scroll. The viewport clamps its reported distance to this, so scrolling deeper
 * reports the same value and rerenders nothing.
 */
export const STICKY_BLOCK_REVEAL_DISTANCE = STICKY_PIN_LINE_HEIGHT * 2;

/**
 * Reveal progress, 0..1, for how far content has scrolled under the fold. Linear
 * with the scroll: the text is already placed, so the surface follows the scroll
 * straight across rather than on a curve of its own. This measures total scroll
 * from the top of the conversation, so it plays once — the surface is a mask,
 * and once it is up it stays.
 */
export function stickyBlockRevealProgress(revealDistance: number): number {
  if (!Number.isFinite(revealDistance) || revealDistance <= 0) {
    return 0;
  }
  if (revealDistance >= STICKY_BLOCK_REVEAL_DISTANCE) {
    return 1;
  }
  return revealDistance / STICKY_BLOCK_REVEAL_DISTANCE;
}

/**
 * Scroll a response's rule wipes across, measured from where that response
 * pinned. Unlike the surface, the rule replays for each response as it becomes
 * the pinned one, so this is per-response scroll, not scroll from the top.
 */
export const STICKY_BLOCK_BAR_REVEAL_DISTANCE = STICKY_PIN_LINE_HEIGHT * 3;

/**
 * Rule extension, 0..1, for how far the pinned response has scrolled past the
 * fold since it pinned. Linear with the scroll, so the underline wipes out from
 * the text's edge in step with reading down the response.
 */
export function stickyBlockBarRevealProgress(distanceSincePinned: number): number {
  if (!Number.isFinite(distanceSincePinned) || distanceSincePinned <= 0) {
    return 0;
  }
  if (distanceSincePinned >= STICKY_BLOCK_BAR_REVEAL_DISTANCE) {
    return 1;
  }
  return distanceSincePinned / STICKY_BLOCK_BAR_REVEAL_DISTANCE;
}

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
export function stickyConversationFoldOffset(
  mode: StickyConversationHeaderMode,
  previews: StickyConversationPreviews,
  rowHeights?: StickyConversationRowHeights,
): number {
  if (mode === "off") {
    return 0;
  }
  const lastRowRole = mode === "user-and-ai" ? newestRole(previews) : "user";
  const lastRowTop =
    mode === "user-and-ai" ? stickyConversationRowHeight(oldestRole(previews), rowHeights) : 0;
  return lastRowTop + stickyConversationTextInset(lastRowRole);
}

function oldestRole(previews: StickyConversationPreviews): "user" | "assistant" {
  return (previews.user?.sequence ?? -1) <= (previews.assistant?.sequence ?? -1)
    ? "user"
    : "assistant";
}

function newestRole(previews: StickyConversationPreviews): "user" | "assistant" {
  return (previews.user?.sequence ?? -1) >= (previews.assistant?.sequence ?? -1)
    ? "user"
    : "assistant";
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
  return incomingRole !== newestRole(previews);
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
  const items = [...tail, ...head];
  const groups = buildStreamMessageGroups(items);
  const total = items.length;
  const itemAt = (index: number): StreamItem | undefined => items[index];
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
    const group = item ? groups.get(item.id) : undefined;
    if (!group?.isHost) {
      continue;
    }
    if (group.message.kind === "user_message") {
      return "user";
    }
    return "assistant";
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
  rowHeights?: StickyConversationRowHeights;
}): number {
  const { distanceToFold } = input;
  if (distanceToFold === null || !Number.isFinite(distanceToFold)) {
    return 0;
  }
  if (!willDisplaceTopLine(input)) {
    return 0;
  }
  const rowHeight = stickyConversationRowHeight(
    input.mode === "user-and-ai" ? oldestRole(input.previews) : "user",
    input.rowHeights,
  );
  const push = rowHeight - distanceToFold;
  if (push <= 0) {
    return 0;
  }
  return Math.min(push, rowHeight);
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
export function isStickyPreviewTrackedItem(
  item: StreamItem,
  messageStartIds?: ReadonlySet<string>,
): boolean {
  return messageStartIds
    ? messageStartIds.has(item.id)
    : item.kind === "user_message" || item.kind === "assistant_message";
}

export function shouldTrackStickyPreviews(mode: StickyConversationHeaderMode): boolean {
  return mode !== "off";
}

export function toStickyPreviewText(text: string): string {
  return text.replace(/\r\n?/g, "\n").split("\n", 1)[0]?.trim() ?? "";
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

  const items = [...tail, ...head];
  const groups = buildStreamMessageGroups(items);
  const total = items.length;
  const itemAt = (index: number): StreamItem | undefined => items[index];

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
    } else if (wantsAssistant && !assistant) {
      const group = groups.get(item.id);
      if (group?.message.kind !== "assistant_message") {
        continue;
      }
      const generationStart = generationStartByItemId?.get(group.message.id);
      assistant = toPreview(
        group.message.id,
        group.message.text,
        generationStart === undefined
          ? group.message.timestamp.getTime()
          : Math.min(generationStart, group.message.timestamp.getTime()),
        group.hostIndex,
      );
    }
  }

  return { user, assistant };
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
