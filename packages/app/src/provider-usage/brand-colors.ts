export interface ProviderBrandColors {
  background: string;
  foreground: string;
}

const DEFAULT_BRAND: ProviderBrandColors = {
  background: "#6B7280",
  foreground: "#FFFFFF",
};

// Brand colors are chosen from each provider's official visual identity and are
// stored as opaque sRGB hex values. The foreground is pre-selected for accessible
// contrast against the background.
const BRAND_COLORS: Record<string, ProviderBrandColors> = {
  claude: { background: "#D97757", foreground: "#FFFFFF" },
  codex: { background: "#10A37F", foreground: "#FFFFFF" },
  copilot: { background: "#24292F", foreground: "#FFFFFF" },
  gemini: { background: "#4285F4", foreground: "#FFFFFF" },
  opencode: { background: "#6366F1", foreground: "#FFFFFF" },
  pi: { background: "#8B5CF6", foreground: "#FFFFFF" },
  minimax: { background: "#F97316", foreground: "#FFFFFF" },
};

export function getProviderBrandColors(providerId: string | null | undefined): ProviderBrandColors {
  if (!providerId) return DEFAULT_BRAND;
  return BRAND_COLORS[providerId.toLowerCase()] ?? DEFAULT_BRAND;
}
