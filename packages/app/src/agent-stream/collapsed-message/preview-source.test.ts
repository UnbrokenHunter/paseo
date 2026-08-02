import { describe, expect, it } from "vitest";
import { COLLAPSED_PREVIEW_SOURCE_MAX_CHARS, clipMarkdownPreviewSource } from "./preview-source";

describe("clipMarkdownPreviewSource", () => {
  it("returns short markdown untouched", () => {
    expect(clipMarkdownPreviewSource("hello **world**")).toBe("hello **world**");
  });

  it("clips longer markdown to the budget", () => {
    const text = "a".repeat(COLLAPSED_PREVIEW_SOURCE_MAX_CHARS + 100);
    expect(clipMarkdownPreviewSource(text)).toHaveLength(COLLAPSED_PREVIEW_SOURCE_MAX_CHARS);
  });

  it("closes a fence the clip cut open", () => {
    const text = `intro\n\`\`\`ts\n${"const value = 1;\n".repeat(80)}`;
    const clipped = clipMarkdownPreviewSource(text, 40);
    expect(clipped.endsWith("\n```")).toBe(true);
  });

  it("leaves a balanced fence alone", () => {
    const text = "```ts\nconst value = 1;\n```\nafter";
    expect(clipMarkdownPreviewSource(text)).toBe(text);
  });

  it("closes a tilde fence with a tilde fence", () => {
    const clipped = clipMarkdownPreviewSource("~~~\ncode here\nmore code\n", 20);
    expect(clipped.endsWith("\n~~~")).toBe(true);
  });

  it("treats a longer closing fence as closing", () => {
    const text = "```\ncode\n`````\ntail";
    expect(clipMarkdownPreviewSource(text)).toBe(text);
  });

  it("does not treat a shorter run as closing the fence", () => {
    const clipped = clipMarkdownPreviewSource("````\ncode\n```\ntail");
    expect(clipped.endsWith("\n````")).toBe(true);
  });

  it("drops the gap between two paragraphs", () => {
    expect(clipMarkdownPreviewSource("First line.\n\nSecond line.")).toBe(
      "First line.\nSecond line.",
    );
  });

  it("keeps a blank line a following construct needs to parse", () => {
    for (const next of ["- item", "1. item", "> quote", "## heading", "| a | b |"]) {
      expect(clipMarkdownPreviewSource(`Intro.\n\n${next}`)).toBe(`Intro.\n\n${next}`);
    }
    expect(clipMarkdownPreviewSource("Intro.\n\n```ts\ncode\n```")).toBe(
      "Intro.\n\n```ts\ncode\n```",
    );
  });

  it("leaves blank lines inside a fence alone", () => {
    const text = "```ts\nconst a = 1;\n\nconst b = 2;\n```";
    expect(clipMarkdownPreviewSource(text)).toBe(text);
  });

  it("collapses a run of blank lines between paragraphs", () => {
    expect(clipMarkdownPreviewSource("One.\n\n\n\nTwo.")).toBe("One.\nTwo.");
  });
});
