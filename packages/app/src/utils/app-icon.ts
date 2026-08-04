import type { ThemeName } from "@/styles/theme";

export type AppIconStatus = "none" | "running" | "attention";
export type SystemIconColorScheme = "light" | "dark";

interface AppIconDefinition {
  desktopAssetName: string;
  faviconBaseName: string;
}

export const STANDARD_APP_ICON_THEME: ThemeName = "dark";

// This registry is the only theme-to-icon mapping used by the web and desktop
// surfaces. The Record keeps additions to ThemeName from silently inheriting an
// unrelated icon.
export const APP_ICON_REGISTRY: Record<ThemeName, AppIconDefinition> = {
  light: {
    desktopAssetName: "icon-light.png",
    faviconBaseName: "favicon-light",
  },
  dark: {
    desktopAssetName: "icon-dark.png",
    faviconBaseName: "favicon-dark",
  },
  zinc: {
    desktopAssetName: "icon-zinc.png",
    faviconBaseName: "favicon-zinc",
  },
  midnight: {
    desktopAssetName: "icon-midnight.png",
    faviconBaseName: "favicon-midnight",
  },
  claude: {
    desktopAssetName: "icon-claude.png",
    faviconBaseName: "favicon-claude",
  },
  ghostty: {
    desktopAssetName: "icon-ghostty.png",
    faviconBaseName: "favicon-ghostty",
  },
};

function isRegisteredAppIconTheme(value: unknown): value is ThemeName {
  return typeof value === "string" && Object.hasOwn(APP_ICON_REGISTRY, value);
}

export function resolveAppIconTheme(
  selectedTheme: ThemeName | "auto" | unknown,
  systemColorScheme: SystemIconColorScheme,
): ThemeName {
  if (selectedTheme === "auto") {
    return systemColorScheme === "light" ? "light" : "dark";
  }
  return isRegisteredAppIconTheme(selectedTheme) ? selectedTheme : STANDARD_APP_ICON_THEME;
}

export function getDesktopAppIconAssetName(theme: ThemeName): string {
  return APP_ICON_REGISTRY[theme]?.desktopAssetName ?? APP_ICON_REGISTRY.dark.desktopAssetName;
}

export function getFaviconPath(theme: ThemeName, status: AppIconStatus): string {
  const definition = APP_ICON_REGISTRY[theme] ?? APP_ICON_REGISTRY.dark;
  const suffix = status === "none" ? "" : `-${status}`;
  return `/app-icons/${definition.faviconBaseName}${suffix}.png`;
}

export function deriveAppIconStatus(
  agents: ReadonlyArray<{
    status?: string;
    requiresAttention?: boolean;
    pendingPermissionCount?: number;
  }>,
): AppIconStatus {
  if (agents.some((agent) => agent.status === "running")) {
    return "running";
  }
  if (agents.some((agent) => agent.requiresAttention || (agent.pendingPermissionCount ?? 0) > 0)) {
    return "attention";
  }
  return "none";
}
