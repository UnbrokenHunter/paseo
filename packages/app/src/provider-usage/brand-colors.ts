/**
 * Accent colors drawn from each provider's visual identity, as opaque sRGB hex.
 *
 * These are accents, not fills. The usage pill tints its background with `accent` at
 * low alpha and takes its text color from the theme, so a light brand on a light theme
 * and a near-black brand like Copilot's on a dark theme both stay readable. Painting
 * the pill in solid brand color instead makes it the loudest thing in the composer and
 * leaves the text contrast at the mercy of whichever brand is active.
 */
const BRAND_ACCENTS: Record<string, string> = {
  claude: "#D97757",
  codex: "#10A37F",
  copilot: "#6E7681",
  cursor: "#7C7CF0",
  gemini: "#4285F4",
  grok: "#8E8EA0",
  kimi: "#4D6BFE",
  minimax: "#F97316",
  opencode: "#6366F1",
  pi: "#8B5CF6",
  zai: "#3B82F6",
};

/** Providers with no brand of their own get the neutral accent. */
const DEFAULT_ACCENT = "#8B95A5";

/** Alpha suffixes for 8-digit hex. Tuned against both the light and dark surfaces. */
const TINT_ALPHA = "24";
const BORDER_ALPHA = "59";

export interface ProviderBrandColors {
  /** Full-strength accent, for the status dot. */
  accent: string;
  /** Accent at low alpha, for the pill background. */
  tint: string;
  /** Accent at medium alpha, for the pill outline. */
  border: string;
}

export function getProviderBrandColors(providerId: string | null | undefined): ProviderBrandColors {
  const accent = providerId
    ? (BRAND_ACCENTS[providerId.toLowerCase()] ?? DEFAULT_ACCENT)
    : DEFAULT_ACCENT;
  return {
    accent,
    tint: `${accent}${TINT_ALPHA}`,
    border: `${accent}${BORDER_ALPHA}`,
  };
}
