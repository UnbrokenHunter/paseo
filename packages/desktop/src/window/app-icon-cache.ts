import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const APP_ICON_CACHE_FILENAME = "app-icon.json";

export interface AppIconCache {
  load(): Promise<string | null>;
  save(assetName: string): Promise<void>;
}

export function parseAppIconAssetName(value: unknown): string | null {
  if (typeof value !== "string" || !/^icon-[a-z0-9]+(?:-[a-z0-9]+)*\.png$/.test(value)) {
    return null;
  }
  return value;
}

export function parsePersistedAppIcon(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const document = value as Record<string, unknown>;
  return document.version === 1 ? parseAppIconAssetName(document.assetName) : null;
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

export function createAppIconCache({ userDataPath }: { userDataPath: string }): AppIconCache {
  const filePath = path.join(userDataPath, APP_ICON_CACHE_FILENAME);
  let persistQueue: Promise<void> = Promise.resolve();

  return {
    async load(): Promise<string | null> {
      let raw: string;
      try {
        raw = await readFile(filePath, "utf8");
      } catch (error) {
        if (isMissingFileError(error)) return null;
        throw error;
      }

      try {
        return parsePersistedAppIcon(JSON.parse(raw));
      } catch (error) {
        if (error instanceof SyntaxError) return null;
        throw error;
      }
    },

    async save(assetName: string): Promise<void> {
      const parsedAssetName = parseAppIconAssetName(assetName);
      if (!parsedAssetName) return;

      const contents = `${JSON.stringify({ version: 1, assetName: parsedAssetName }, null, 2)}\n`;
      async function write(): Promise<void> {
        await mkdir(userDataPath, { recursive: true });
        const tempPath = `${filePath}.tmp.${process.pid}.${randomUUID()}`;
        try {
          await writeFile(tempPath, contents, "utf8");
          await rename(tempPath, filePath);
        } catch (error) {
          await unlink(tempPath).catch(() => undefined);
          throw error;
        }
      }

      const queued = persistQueue.then(write, write);
      persistQueue = queued.catch(() => undefined);
      await queued;
    },
  };
}
