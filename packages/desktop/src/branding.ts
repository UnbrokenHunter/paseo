import { readFileSync } from "node:fs";
import path from "node:path";
import { app } from "electron";

const DEFAULT_APP_NAME = "Paseo";
const DEFAULT_APP_SCHEME = "paseo";
const APP_SCHEME_RE = /^[a-z][a-z0-9+.-]*$/i;

interface DesktopBrandingMetadata {
  paseoDesktop?: {
    appName?: unknown;
    appScheme?: unknown;
  };
}

export interface DesktopBranding {
  appName: string;
  appScheme: string;
  appOrigin: string;
}

function readDesktopBrandingMetadata(): DesktopBrandingMetadata | null {
  const packageJsonPath = app.isPackaged
    ? path.join(app.getAppPath(), "package.json")
    : path.resolve(__dirname, "..", "package.json");

  try {
    return JSON.parse(readFileSync(packageJsonPath, "utf8")) as DesktopBrandingMetadata;
  } catch {
    return null;
  }
}

function normalizeAppName(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeAppScheme(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim().toLowerCase();
  return APP_SCHEME_RE.test(trimmed) ? trimmed : null;
}

export function getDesktopBranding(): DesktopBranding {
  const metadata = readDesktopBrandingMetadata()?.paseoDesktop;
  const appName =
    normalizeAppName(process.env.PASEO_TEST_APP_NAME) ??
    normalizeAppName(metadata?.appName) ??
    DEFAULT_APP_NAME;
  const appScheme =
    normalizeAppScheme(process.env.PASEO_APP_SCHEME) ??
    normalizeAppScheme(metadata?.appScheme) ??
    DEFAULT_APP_SCHEME;

  return {
    appName,
    appScheme,
    appOrigin: `${appScheme}://app`,
  };
}
