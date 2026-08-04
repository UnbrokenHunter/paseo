import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  app: {
    isPackaged: false,
    getAppPath: vi.fn(() => ""),
  },
}));

vi.mock("electron", () => ({
  app: mocks.app,
}));

const originalAppScheme = process.env.PASEO_APP_SCHEME;
const originalAppName = process.env.PASEO_TEST_APP_NAME;
const roots: string[] = [];

describe("desktop branding", () => {
  afterEach(async () => {
    if (originalAppScheme === undefined) {
      delete process.env.PASEO_APP_SCHEME;
    } else {
      process.env.PASEO_APP_SCHEME = originalAppScheme;
    }
    if (originalAppName === undefined) {
      delete process.env.PASEO_TEST_APP_NAME;
    } else {
      process.env.PASEO_TEST_APP_NAME = originalAppName;
    }
    mocks.app.isPackaged = false;
    mocks.app.getAppPath.mockReset();
    mocks.app.getAppPath.mockReturnValue("");
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
    vi.resetModules();
  });

  test("reads packaged branding metadata from the packaged app manifest", async () => {
    const appRoot = await mkdtemp(path.join(os.tmpdir(), "paseo-desktop-branding-"));
    roots.push(appRoot);
    await writeFile(
      path.join(appRoot, "package.json"),
      JSON.stringify(
        {
          paseoDesktop: {
            appName: "PaseoPlus",
            appScheme: "paseoplus",
          },
        },
        null,
        2,
      ),
    );
    mocks.app.isPackaged = true;
    mocks.app.getAppPath.mockReturnValue(appRoot);

    const { getDesktopBranding } = await import("./branding.js");

    expect(getDesktopBranding()).toEqual({
      appName: "PaseoPlus",
      appScheme: "paseoplus",
      appOrigin: "paseoplus://app",
    });
  });

  test("lets explicit env overrides win over packaged metadata", async () => {
    const appRoot = await mkdtemp(path.join(os.tmpdir(), "paseo-desktop-branding-"));
    roots.push(appRoot);
    await writeFile(
      path.join(appRoot, "package.json"),
      JSON.stringify(
        {
          paseoDesktop: {
            appName: "PaseoPlus",
            appScheme: "paseoplus",
          },
        },
        null,
        2,
      ),
    );
    mocks.app.isPackaged = true;
    mocks.app.getAppPath.mockReturnValue(appRoot);
    process.env.PASEO_TEST_APP_NAME = "Paseo QA";
    process.env.PASEO_APP_SCHEME = "paseoqa";

    const { getDesktopBranding } = await import("./branding.js");

    expect(getDesktopBranding()).toEqual({
      appName: "Paseo QA",
      appScheme: "paseoqa",
      appOrigin: "paseoqa://app",
    });
  });
});
