import { describe, expect, it } from "vitest";
import type { ThemeName } from "@/styles/theme";
import {
  APP_ICON_REGISTRY,
  deriveAppIconStatus,
  getDesktopAppIconAssetName,
  getFaviconPath,
  resolveAppIconTheme,
  type AppIconStatus,
} from "./app-icon";

const THEMES: ThemeName[] = ["light", "dark", "zinc", "midnight", "claude", "ghostty"];
const STATUSES: AppIconStatus[] = ["none", "running", "attention"];

describe("app icon selection", () => {
  it("registers a distinct icon for every official theme", () => {
    expect(Object.keys(APP_ICON_REGISTRY)).toEqual(THEMES);
    expect(new Set(THEMES.map(getDesktopAppIconAssetName)).size).toBe(THEMES.length);
  });

  it("resolves named themes and Auto appearances", () => {
    for (const theme of THEMES) {
      expect(resolveAppIconTheme(theme, "light")).toBe(theme);
      expect(resolveAppIconTheme(theme, "dark")).toBe(theme);
    }
    expect(resolveAppIconTheme("auto", "light")).toBe("light");
    expect(resolveAppIconTheme("auto", "dark")).toBe("dark");
  });

  it("uses the standard Paseo icon for invalid theme identifiers", () => {
    expect(resolveAppIconTheme("unknown", "light")).toBe("dark");
    expect(resolveAppIconTheme(null, "dark")).toBe("dark");
  });

  it("provides every favicon status without discarding the selected theme", () => {
    for (const theme of THEMES) {
      for (const status of STATUSES) {
        const suffix = status === "none" ? "" : `-${status}`;
        expect(getFaviconPath(theme, status)).toBe(`/app-icons/favicon-${theme}${suffix}.png`);
      }
    }
  });

  it("keeps the existing running-before-attention status priority", () => {
    expect(deriveAppIconStatus([])).toBe("none");
    expect(deriveAppIconStatus([{ requiresAttention: true }])).toBe("attention");
    expect(deriveAppIconStatus([{ pendingPermissionCount: 1 }])).toBe("attention");
    expect(deriveAppIconStatus([{ requiresAttention: true }, { status: "running" }])).toBe(
      "running",
    );
  });
});
