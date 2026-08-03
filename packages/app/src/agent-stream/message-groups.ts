import type { AssistantMessageItem, StreamItem, UserMessageItem } from "@/types/stream";

export type StreamMessage = UserMessageItem | AssistantMessageItem;

export interface StreamMessageGroupItem {
  message: StreamMessage;
  hostIndex: number;
  isHost: boolean;
  itemCount: number;
}

/**
 * The renderer splits one assistant response into markdown and tool-call rows.
 * A message starts at the first assistant text after a user message and owns
 * every row until the next user message.
 */
export function buildStreamMessageGroups(
  items: readonly StreamItem[],
): ReadonlyMap<string, StreamMessageGroupItem> {
  const groups = new Map<string, StreamMessageGroupItem>();

  for (let index = 0; index < items.length; ) {
    const item = items[index];
    if (item.kind === "user_message") {
      groups.set(item.id, { message: item, hostIndex: index, isHost: true, itemCount: 1 });
      index += 1;
      continue;
    }

    let end = index + 1;
    while (end < items.length && items[end].kind !== "user_message") {
      end += 1;
    }
    let hostIndex = index;
    while (hostIndex < end && items[hostIndex].kind !== "assistant_message") {
      hostIndex += 1;
    }
    const message = items[hostIndex];
    if (message?.kind === "assistant_message") {
      for (let cursor = index; cursor < end; cursor += 1) {
        groups.set(items[cursor].id, {
          message,
          hostIndex,
          isHost: cursor === hostIndex,
          itemCount: end - index,
        });
      }
    }
    index = end;
  }

  return groups;
}

export function selectMessageStartIds(items: readonly StreamItem[]): ReadonlySet<string> {
  const starts = new Set<string>();
  for (const group of buildStreamMessageGroups(items).values()) {
    if (group.isHost) {
      starts.add(group.message.id);
    }
  }
  return starts;
}
