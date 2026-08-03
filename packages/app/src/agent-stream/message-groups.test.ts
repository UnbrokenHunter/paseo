import { describe, expect, it } from "vitest";
import type { StreamItem } from "@/types/stream";
import { buildStreamMessageGroups, selectMessageStartIds } from "./message-groups";

const at = (id: string, kind: StreamItem["kind"], text = ""): StreamItem => {
  const base = { id, timestamp: new Date(0) };
  if (kind === "user_message" || kind === "assistant_message") return { ...base, kind, text };
  if (kind === "thought") return { ...base, kind, text, status: "ready" };
  throw new Error(`Unsupported test item: ${kind}`);
};

describe("stream message groups", () => {
  it("treats paragraphs and tool-call-adjacent text as one assistant message", () => {
    const items = [
      at("u", "user_message", "question"),
      at("a1", "assistant_message", "first paragraph"),
      at("thinking", "thought", "working"),
      at("a2", "assistant_message", "after the tool call"),
    ];
    const groups = buildStreamMessageGroups(items);

    expect(selectMessageStartIds(items)).toEqual(new Set(["u", "a1"]));
    expect(groups.get("a2")?.message.id).toBe("a1");
    expect(groups.get("thinking")?.message.id).toBe("a1");
    expect(groups.get("a1")?.itemCount).toBe(3);
  });

  it("starts a new assistant message only after the next user message", () => {
    const items = [
      at("u1", "user_message", "one"),
      at("a1", "assistant_message", "answer one"),
      at("u2", "user_message", "two"),
      at("a2", "assistant_message", "answer two"),
    ];

    expect(selectMessageStartIds(items)).toEqual(new Set(["u1", "a1", "u2", "a2"]));
  });
});
