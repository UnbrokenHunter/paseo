import { useEffect, useRef } from "react";
import { getIsElectronRuntimeMac } from "@/constants/layout";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAppSettings } from "@/hooks/use-settings";
import { useAggregatedAgents } from "./use-aggregated-agents";
import { getDesktopHost } from "@/desktop/host";
import { useWorkspaceStatusesForBadges } from "@/stores/session-store-hooks";
import { deriveMacDockBadgeCountFromWorkspaceStatuses } from "@/utils/desktop-badge-state";
import {
  deriveAppIconStatus,
  getDesktopAppIconAssetName,
  getFaviconPath,
  resolveAppIconTheme,
  STANDARD_APP_ICON_THEME,
  type AppIconStatus,
} from "@/utils/app-icon";
import { isNative } from "@/constants/platform";

let faviconErrorHandler: (() => void) | null = null;

function getOrCreateFaviconLink(): HTMLLinkElement | null {
  if (typeof document === "undefined") return null;

  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    link.type = "image/png";
    document.head.appendChild(link);
  }
  return link;
}

function updateFavicon(theme: Parameters<typeof getFaviconPath>[0], status: AppIconStatus): void {
  const link = getOrCreateFaviconLink();
  if (!link) return;

  const href = getFaviconPath(theme, status);
  if (faviconErrorHandler) link.removeEventListener("error", faviconErrorHandler);
  faviconErrorHandler = () => {
    const fallbackHref = getFaviconPath(STANDARD_APP_ICON_THEME, status);
    faviconErrorHandler = null;
    if (fallbackHref !== href) {
      link.addEventListener("error", () => (link.href = "/favicon.ico"), { once: true });
    }
    link.href = fallbackHref === href ? "/favicon.ico" : fallbackHref;
  };
  link.addEventListener("error", faviconErrorHandler, { once: true });
  if (link.getAttribute("href") !== href) link.href = href;
}

async function updateDesktopIcon(assetName: string): Promise<void> {
  const desktopWindow = getDesktopHost()?.window?.getCurrentWindow?.();
  if (!desktopWindow || typeof desktopWindow.setAppIcon !== "function") {
    return;
  }

  try {
    await desktopWindow.setAppIcon(assetName);
  } catch (error) {
    console.warn("[useFaviconStatus] Failed to update desktop app icon", error);
  }
}

async function updateDockBadge(count?: number): Promise<void> {
  if (!getIsElectronRuntimeMac()) return;
  const desktopWindow = getDesktopHost()?.window?.getCurrentWindow?.();
  if (!desktopWindow || typeof desktopWindow.setBadgeCount !== "function") {
    return;
  }

  try {
    await desktopWindow.setBadgeCount(count);
  } catch (error) {
    console.warn("[useFaviconStatus] Failed to update desktop badge", error);
  }
}

export function useFaviconStatus() {
  const { agents } = useAggregatedAgents();
  const { settings, isLoading: settingsLoading } = useAppSettings();
  const workspaceStatuses = useWorkspaceStatusesForBadges();
  const systemColorScheme = useColorScheme() ?? "dark";
  const lastDesktopIconRef = useRef<string | null>(null);
  const lastDockBadgeCountRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (isNative || settingsLoading) return;

    const theme = resolveAppIconTheme(settings.theme, systemColorScheme);
    const status = deriveAppIconStatus(agents);
    updateFavicon(theme, status);

    const desktopIcon = getDesktopAppIconAssetName(theme);
    if (desktopIcon !== lastDesktopIconRef.current) {
      lastDesktopIconRef.current = desktopIcon;
      void updateDesktopIcon(desktopIcon);
    }

    const dockBadgeCount = deriveMacDockBadgeCountFromWorkspaceStatuses(workspaceStatuses);
    if (dockBadgeCount !== lastDockBadgeCountRef.current) {
      lastDockBadgeCountRef.current = dockBadgeCount;
      void updateDockBadge(dockBadgeCount);
    }
  }, [agents, settings.theme, settingsLoading, systemColorScheme, workspaceStatuses]);
}
