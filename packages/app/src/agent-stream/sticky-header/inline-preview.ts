/**
 * A pinned line is the message's own line, so it has to be marked up the way the
 * message is. Left as source, a pinned response reads `**like this**` while the
 * message two lines below it reads like this — and the glyphs are the wrong
 * width, so the line does not even sit still across the handoff.
 *
 * The full renderer is no use here: it lays out blocks, images and code fences,
 * and a pin is one line of inline runs. This turns the source into those runs
 * and drops everything that only makes sense as a block.
 */
export interface StickyPreviewSpan {
  /** Where this run starts in the rendered line. Unique, so it keys the span. */
  offset: number;
  text: string;
  bold: boolean;
  italic: boolean;
  code: boolean;
  strike: boolean;
}

interface Marks {
  bold: boolean;
  italic: boolean;
  code: boolean;
  strike: boolean;
}

const NO_MARKS: Marks = { bold: false, italic: false, code: false, strike: false };

/**
 * Block markers at the head of the line. The preview is a single line, so a
 * heading's hashes or a bullet's dash are punctuation the message itself never
 * shows. Repeated because a quoted bullet stacks them.
 */
const LEADING_BLOCK_MARKER = /^(?:#{1,6}\s+|>\s*|[-*+]\s+|\d+[.)]\s+)/;

/**
 * One inline construct, whichever comes first. Ordered so the ones that swallow
 * their contents whole — code, then links — win over emphasis inside them.
 */
const INLINE_PATTERN = new RegExp(
  [
    "(`+)([\\s\\S]+?)\\1", // 1,2  code span
    "!\\[([^\\]]*)\\]\\([^)]*\\)", // 3    image, kept as its alt text
    "\\[([^\\]]*)\\]\\([^)]*\\)", // 4    link, kept as its label
    "(\\*\\*|__)([\\s\\S]+?)\\5", // 5,6  strong
    "(~~)([\\s\\S]+?)\\7", // 7,8  strikethrough
    "\\*([^\\s*][\\s\\S]*?)\\*", // 9    emphasis
    // An underscore only opens emphasis at a word boundary, so `snake_case_name`
    // stays the identifier it is. The character in front is carried through
    // rather than looked behind: lookbehind is not safe on every engine the app
    // runs on.
    "(^|[^\\w])_([^\\s_][\\s\\S]*?)_(?!\\w)", // 10,11 emphasis
  ].join("|"),
);

/** Emphasis nests, but not without end: a pathological line stops unwrapping. */
const MAX_DEPTH = 6;

export function parseStickyPreviewSpans(text: string): StickyPreviewSpan[] {
  let source = text;
  let stripped = source.replace(LEADING_BLOCK_MARKER, "");
  while (stripped !== source) {
    source = stripped;
    stripped = source.replace(LEADING_BLOCK_MARKER, "");
  }
  const spans: StickyPreviewSpan[] = [];
  collect(source, NO_MARKS, 0, spans);
  return spans.length > 0 ? spans : [{ ...NO_MARKS, offset: 0, text: source }];
}

function collect(text: string, marks: Marks, depth: number, out: StickyPreviewSpan[]): void {
  if (!text) {
    return;
  }
  const match = depth >= MAX_DEPTH ? null : INLINE_PATTERN.exec(text);
  if (!match) {
    push(out, text, marks);
    return;
  }
  push(out, text.slice(0, match.index), marks);
  const rest = text.slice(match.index + match[0].length);

  if (match[2] !== undefined) {
    // Code is literal: nothing inside it is markup.
    push(out, match[2], { ...marks, code: true });
  } else if (match[3] !== undefined) {
    collect(match[3], marks, depth + 1, out);
  } else if (match[4] !== undefined) {
    collect(match[4], marks, depth + 1, out);
  } else if (match[6] !== undefined) {
    collect(match[6], { ...marks, bold: true }, depth + 1, out);
  } else if (match[8] !== undefined) {
    collect(match[8], { ...marks, strike: true }, depth + 1, out);
  } else if (match[9] !== undefined) {
    collect(match[9], { ...marks, italic: true }, depth + 1, out);
  } else if (match[11] !== undefined) {
    push(out, match[10], marks);
    collect(match[11], { ...marks, italic: true }, depth + 1, out);
  }

  collect(rest, marks, depth, out);
}

function push(out: StickyPreviewSpan[], text: string, marks: Marks): void {
  if (!text) {
    return;
  }
  const last = out[out.length - 1];
  if (
    last &&
    last.bold === marks.bold &&
    last.italic === marks.italic &&
    last.code === marks.code &&
    last.strike === marks.strike
  ) {
    last.text += text;
    return;
  }
  out.push({ ...marks, offset: last ? last.offset + last.text.length : 0, text });
}
