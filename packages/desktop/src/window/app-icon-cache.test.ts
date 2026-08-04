import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createAppIconCache, parseAppIconAssetName, parsePersistedAppIcon } from "./app-icon-cache";

const tempDirs = new Set<string>();

async function createTempUserDataDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "paseo-app-icon-"));
  tempDirs.add(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all([...tempDirs].map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs.clear();
});

describe("app icon cache", () => {
  it("accepts generated asset basenames and rejects unsafe values", () => {
    expect(parseAppIconAssetName("icon-midnight.png")).toBe("icon-midnight.png");
    expect(parseAppIconAssetName("../icon-dark.png")).toBeNull();
    expect(parseAppIconAssetName("icon-dark.svg")).toBeNull();
    expect(parseAppIconAssetName("favicon-dark.png")).toBeNull();
  });

  it("validates the persisted document version and asset name", () => {
    expect(parsePersistedAppIcon({ version: 1, assetName: "icon-claude.png" })).toBe(
      "icon-claude.png",
    );
    expect(parsePersistedAppIcon({ version: 2, assetName: "icon-claude.png" })).toBeNull();
    expect(parsePersistedAppIcon({ version: 1, assetName: "../../escape.png" })).toBeNull();
  });

  it("persists and reloads the last successfully resolved icon", async () => {
    const userDataPath = await createTempUserDataDir();
    const cache = createAppIconCache({ userDataPath });

    await cache.save("icon-ghostty.png");

    expect(await createAppIconCache({ userDataPath }).load()).toBe("icon-ghostty.png");
    expect(JSON.parse(await readFile(path.join(userDataPath, "app-icon.json"), "utf8"))).toEqual({
      version: 1,
      assetName: "icon-ghostty.png",
    });
  });

  it("falls back for invalid or corrupt persisted values", async () => {
    const userDataPath = await createTempUserDataDir();
    const filePath = path.join(userDataPath, "app-icon.json");
    const cache = createAppIconCache({ userDataPath });

    await writeFile(filePath, "{ invalid", "utf8");
    expect(await cache.load()).toBeNull();

    await writeFile(filePath, JSON.stringify({ version: 1, assetName: "../escape.png" }), "utf8");
    expect(await cache.load()).toBeNull();
  });
});
