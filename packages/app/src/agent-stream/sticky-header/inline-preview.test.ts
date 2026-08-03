import { describe, expect, it } from "vitest";
import { parseStickyPreviewSpans } from "./inline-preview";

const plain = (text: string) => ({
  text,
  bold: false,
  italic: false,
  code: false,
  strike: false,
});

/** Marks and text only. Offsets follow from the text, and are asserted once. */
const marked = (source: string) =>
  parseStickyPreviewSpans(source).map(({ offset: _offset, ...span }) => span);

describe("parseStickyPreviewSpans", () => {
  it("leaves an unmarked line alone", () => {
    expect(marked("just some words")).toEqual([plain("just some words")]);
  });

  it("keeps an empty line renderable", () => {
    expect(marked("")).toEqual([plain("")]);
  });

  it("marks the run instead of showing its syntax", () => {
    expect(marked("this is **bold** here")).toEqual([
      plain("this is "),
      { ...plain("bold"), bold: true },
      plain(" here"),
    ]);
  });

  it("handles emphasis, code and strikethrough", () => {
    expect(marked("_soft_ `code` ~~gone~~")).toEqual([
      { ...plain("soft"), italic: true },
      plain(" "),
      { ...plain("code"), code: true },
      plain(" "),
      { ...plain("gone"), strike: true },
    ]);
  });

  it("nests marks", () => {
    expect(marked("**bold and _both_**")).toEqual([
      { ...plain("bold and "), bold: true },
      { ...plain("both"), bold: true, italic: true },
    ]);
  });

  it("takes code literally", () => {
    expect(marked("run `npm run **dev**` now")).toEqual([
      plain("run "),
      { ...plain("npm run **dev**"), code: true },
      plain(" now"),
    ]);
  });

  it("keeps a link's label and drops its target", () => {
    expect(marked("see [the docs](https://x.test/a_b) first")).toEqual([
      plain("see the docs first"),
    ]);
  });

  it("keeps an image's alt text", () => {
    expect(marked("before ![a chart](x.png) after")).toEqual([plain("before a chart after")]);
  });

  it("drops block markers the message never shows", () => {
    expect(marked("## A heading")).toEqual([plain("A heading")]);
    expect(marked("- a bullet")).toEqual([plain("a bullet")]);
    expect(marked("> - a quoted bullet")).toEqual([plain("a quoted bullet")]);
    expect(marked("1. a step")).toEqual([plain("a step")]);
  });

  it("leaves lone punctuation as text", () => {
    expect(marked("2 * 3 = 6")).toEqual([plain("2 * 3 = 6")]);
    expect(marked("snake_case_name")).toEqual([plain("snake_case_name")]);
  });

  it("offsets each run by where it starts in the line", () => {
    expect(parseStickyPreviewSpans("a **b** c")).toEqual([
      { ...plain("a "), offset: 0 },
      { ...plain("b"), bold: true, offset: 2 },
      { ...plain(" c"), offset: 3 },
    ]);
  });
});
