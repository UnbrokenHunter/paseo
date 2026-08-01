import { beforeEach, describe, expect, it } from "vitest";
import {
  collapsedMessageKey,
  setMessageCollapsed,
  toggleMessageCollapsed,
  useCollapsedMessagesStore,
} from "./store";

function isCollapsed(agentId: string, itemId: string): boolean {
  return useCollapsedMessagesStore
    .getState()
    .collapsedKeys.has(collapsedMessageKey(agentId, itemId));
}

describe("collapsed messages store", () => {
  beforeEach(() => {
    useCollapsedMessagesStore.setState({ collapsedKeys: new Set<string>() });
  });

  it("starts with every message expanded", () => {
    expect(isCollapsed("agent-1", "item-1")).toBe(false);
  });

  it("collapses and expands a single message", () => {
    setMessageCollapsed({ agentId: "agent-1", itemId: "item-1", collapsed: true });
    expect(isCollapsed("agent-1", "item-1")).toBe(true);

    setMessageCollapsed({ agentId: "agent-1", itemId: "item-1", collapsed: false });
    expect(isCollapsed("agent-1", "item-1")).toBe(false);
  });

  it("toggles a message independently of its neighbours", () => {
    toggleMessageCollapsed({ agentId: "agent-1", itemId: "item-1" });
    expect(isCollapsed("agent-1", "item-1")).toBe(true);
    expect(isCollapsed("agent-1", "item-2")).toBe(false);

    toggleMessageCollapsed({ agentId: "agent-1", itemId: "item-1" });
    expect(isCollapsed("agent-1", "item-1")).toBe(false);
  });

  it("keeps agents separate when they share item ids", () => {
    setMessageCollapsed({ agentId: "agent-1", itemId: "item-1", collapsed: true });
    expect(isCollapsed("agent-2", "item-1")).toBe(false);
  });

  it("keeps the same state object when nothing changes", () => {
    const before = useCollapsedMessagesStore.getState().collapsedKeys;
    setMessageCollapsed({ agentId: "agent-1", itemId: "item-1", collapsed: false });
    expect(useCollapsedMessagesStore.getState().collapsedKeys).toBe(before);
  });
});
