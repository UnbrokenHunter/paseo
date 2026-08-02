/**
 * A collapsed bubble shows the real start of the message — markdown, images,
 * code — clipped to a small box. Only the first few hundred characters can ever
 * land inside that box, so the renderer gets a clipped copy of the source
 * instead of the whole message: a 40k-character response would otherwise pay
 * full markdown parse and layout cost on every streaming flush to draw two
 * visible lines.
 */
export const COLLAPSED_PREVIEW_SOURCE_MAX_CHARS = 600;

const FENCE_PATTERN = /^ {0,3}(?:`{3,}|~{3,})/;
/**
 * Constructs that need the blank line above them to parse: list items, block
 * quotes, headings, fences, tables, and thematic breaks. Between two ordinary
 * paragraphs the blank line is just spacing.
 */
const NEEDS_LEADING_BLANK_PATTERN = /^ {0,3}(?:[-*+>#|]|\d+[.)]|`{3,}|~{3,}|={3,})/;

/**
 * Prepare a message's markdown for the collapsed preview: clip it to `maxChars`
 * and drop the blank lines between paragraphs.
 *
 * Clipping has one sharp edge — a cut inside a fenced block leaves the fence
 * open and the rest renders as one grey slab — so the clip closes a fence it
 * opened.
 *
 * The blank lines matter because the box is only a couple of lines tall. A
 * response that opens with a one-line paragraph would spend the second line on
 * an empty paragraph gap, so the stub reads as a line of text and a patch of
 * dead space rather than as the top of something longer. Blank lines inside a
 * fence are content and are left alone, as is any blank line that a following
 * construct needs in order to parse.
 */
export function clipMarkdownPreviewSource(
  text: string,
  maxChars: number = COLLAPSED_PREVIEW_SOURCE_MAX_CHARS,
): string {
  const clipped = text.length <= maxChars ? text : text.slice(0, maxChars);
  return compactParagraphGaps(closeOpenFence(clipped));
}

function closeOpenFence(text: string): string {
  let openFence: string | null = null;
  for (const line of text.split("\n")) {
    const match = FENCE_PATTERN.exec(line);
    if (!match) {
      continue;
    }
    const marker = match[0].trim();
    if (openFence === null) {
      openFence = marker;
    } else if (marker[0] === openFence[0] && marker.length >= openFence.length) {
      openFence = null;
    }
  }
  if (openFence === null) {
    return text;
  }
  return `${text}\n${openFence}`;
}

function compactParagraphGaps(text: string): string {
  const lines = text.split("\n");
  const kept: string[] = [];
  let openFence: string | null = null;

  for (const [index, line] of lines.entries()) {
    const match = FENCE_PATTERN.exec(line);
    if (match) {
      const marker = match[0].trim();
      if (openFence === null) {
        openFence = marker;
      } else if (marker[0] === openFence[0] && marker.length >= openFence.length) {
        openFence = null;
      }
      kept.push(line);
      continue;
    }

    if (openFence !== null || line.trim() !== "") {
      kept.push(line);
      continue;
    }

    const next = nextNonBlankLine(lines, index + 1);
    if (next !== null && NEEDS_LEADING_BLANK_PATTERN.test(next)) {
      kept.push(line);
    }
  }

  return kept.join("\n");
}

function nextNonBlankLine(lines: readonly string[], from: number): string | null {
  for (let index = from; index < lines.length; index += 1) {
    if (lines[index].trim() !== "") {
      return lines[index];
    }
  }
  return null;
}
