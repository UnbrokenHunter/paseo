/**
 * A collapsed bubble shows the real start of the message — markdown, images,
 * code — clipped to a fixed box. Only the first few hundred characters can ever
 * land inside that box, so the renderer gets a clipped copy of the source
 * instead of the whole message: a 40k-character response would otherwise pay
 * full markdown parse and layout cost on every streaming flush to draw two
 * visible lines.
 */
export const COLLAPSED_PREVIEW_SOURCE_MAX_CHARS = 600;

const FENCE_PATTERN = /^ {0,3}(?:`{3,}|~{3,})/;

/**
 * Clip markdown to `maxChars` without leaving the parser mid-construct. Cutting
 * inside a fenced block turns the rest of the preview into an unterminated code
 * fence, which renders as one grey slab instead of the code that was there.
 */
export function clipMarkdownPreviewSource(
  text: string,
  maxChars: number = COLLAPSED_PREVIEW_SOURCE_MAX_CHARS,
): string {
  if (text.length <= maxChars) {
    return closeOpenFence(text);
  }
  return closeOpenFence(text.slice(0, maxChars));
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
