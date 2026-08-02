import { create } from "zustand";

/**
 * Collapsed messages live in memory only. Collapsing is a way to get a long
 * message out of the way while you read around it, not a property of the
 * conversation, so a reload starts everything expanded again and nothing about
 * the collapse reaches the daemon or the model.
 */
interface CollapsedMessagesState {
  collapsedKeys: ReadonlySet<string>;
  /**
   * Messages measured as tall enough to be worth collapsing. Only a rendered
   * message can answer that, and the sticky header shows messages that are off
   * screen — so the message records the answer here and the header reads it,
   * rather than offering a control that would do nothing.
   */
  collapsibleKeys: ReadonlySet<string>;
  setCollapsed: (input: { agentId: string; itemId: string; collapsed: boolean }) => void;
  toggleCollapsed: (input: { agentId: string; itemId: string }) => void;
  setCollapsible: (input: { agentId: string; itemId: string; collapsible: boolean }) => void;
}

// Neither an agent id nor a stream item id can contain a NUL, so the pair
// cannot collide with a different pair that happens to concatenate the same.
const KEY_SEPARATOR = String.fromCharCode(0);

export function collapsedMessageKey(agentId: string, itemId: string): string {
  return `${agentId}${KEY_SEPARATOR}${itemId}`;
}

const EMPTY_KEYS: ReadonlySet<string> = new Set<string>();

export const useCollapsedMessagesStore = create<CollapsedMessagesState>()((set) => ({
  collapsedKeys: EMPTY_KEYS,
  collapsibleKeys: EMPTY_KEYS,
  setCollapsed: ({ agentId, itemId, collapsed }) =>
    set((state) => {
      const key = collapsedMessageKey(agentId, itemId);
      if (state.collapsedKeys.has(key) === collapsed) {
        return state;
      }
      const next = new Set(state.collapsedKeys);
      if (collapsed) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return { collapsedKeys: next };
    }),
  toggleCollapsed: ({ agentId, itemId }) =>
    set((state) => {
      const key = collapsedMessageKey(agentId, itemId);
      const next = new Set(state.collapsedKeys);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return { collapsedKeys: next };
    }),
  setCollapsible: ({ agentId, itemId, collapsible }) =>
    set((state) => {
      const key = collapsedMessageKey(agentId, itemId);
      if (state.collapsibleKeys.has(key) === collapsible) {
        return state;
      }
      const next = new Set(state.collapsibleKeys);
      if (collapsible) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return { collapsibleKeys: next };
    }),
}));

export function useIsMessageCollapsed(agentId: string, itemId: string): boolean {
  return useCollapsedMessagesStore((state) =>
    state.collapsedKeys.has(collapsedMessageKey(agentId, itemId)),
  );
}

export function setMessageCollapsed(input: {
  agentId: string;
  itemId: string;
  collapsed: boolean;
}): void {
  useCollapsedMessagesStore.getState().setCollapsed(input);
}

export function toggleMessageCollapsed(input: { agentId: string; itemId: string }): void {
  useCollapsedMessagesStore.getState().toggleCollapsed(input);
}

export function useIsMessageCollapsible(agentId: string, itemId: string): boolean {
  return useCollapsedMessagesStore((state) =>
    state.collapsibleKeys.has(collapsedMessageKey(agentId, itemId)),
  );
}

export function setMessageCollapsible(input: {
  agentId: string;
  itemId: string;
  collapsible: boolean;
}): void {
  useCollapsedMessagesStore.getState().setCollapsible(input);
}
