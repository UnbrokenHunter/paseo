import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(repositoryRoot, "packages/app/assets/images/favicon-light.svg");
const outputDirectory = path.join(repositoryRoot, "packages/app/public/app-icons");
const checkOnly = process.argv.includes("--check");

const palettes = {
  light: { background: "#f4f4f5", foreground: "#20744A" },
  dark: { background: "#181B1A", foreground: "#7ccba0" },
  zinc: { background: "#18181b", foreground: "#e4e4e7" },
  midnight: { background: "#161820", foreground: "#7eaaeb" },
  claude: { background: "#1f1f1e", foreground: "#e89a7f" },
  ghostty: { background: "#282c34", foreground: "#b4d0fc" },
};

const statusColors = {
  none: null,
  running: "#3b82f6",
  attention: "#22c55e",
};

// Windows draws the taskbar button and titlebar from ICON_SMALL at 16-24px.
// Electron fills that from whatever single representation it is handed, so the
// 512px PNG downscales in one hop and the shell falls back to the executable
// icon instead. A multi-resolution .ico carries real small sizes.
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

function packIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  let offset = 6 + images.length * 16;
  const directory = images.map(({ size, data }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size === 256 ? 0 : size, 0);
    entry.writeUInt8(size === 256 ? 0 : size, 1);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    return entry;
  });

  return Buffer.concat([header, ...directory, ...images.map(({ data }) => data)]);
}

async function emit(relativeName, contents) {
  const outputPath = path.join(outputDirectory, relativeName);
  let current = null;
  try {
    current = await readFile(outputPath);
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }

  const next = Buffer.isBuffer(contents) ? contents : Buffer.from(contents);
  if (current?.equals(next)) return;
  if (checkOnly) throw new Error(`Generated app icon is stale: ${relativeName}`);
  await writeFile(outputPath, next);
}

function renderSvg(source, palette, status) {
  const statusCircle = statusColors[status]
    ? `<circle cx="570" cy="570" r="130" fill="${statusColors[status]}"/>\n`
    : "";
  return source
    .trimEnd()
    .replace('fill="black"', `fill="${palette.background}"`)
    .replace('fill="white"', `fill="${palette.foreground}"`)
    .replace("</svg>", `${statusCircle}</svg>\n`);
}

await mkdir(outputDirectory, { recursive: true });
// Normalize newlines so a CRLF checkout on Windows does not regenerate every
// SVG and fail `check:app-icons`.
const source = (await readFile(sourcePath, "utf8")).replace(/\r\n/g, "\n");

for (const [theme, palette] of Object.entries(palettes)) {
  for (const status of Object.keys(statusColors)) {
    const suffix = status === "none" ? "" : `-${status}`;
    const svg = renderSvg(source, palette, status);
    await emit(`favicon-${theme}${suffix}.svg`, svg);
    await emit(
      `favicon-${theme}${suffix}.png`,
      await sharp(Buffer.from(svg)).resize(48, 48).png({ compressionLevel: 9 }).toBuffer(),
    );
    if (status === "none") {
      await emit(
        `icon-${theme}.png`,
        await sharp(Buffer.from(svg)).resize(512, 512).png({ compressionLevel: 9 }).toBuffer(),
      );
      await emit(
        `icon-${theme}.ico`,
        packIco(
          await Promise.all(
            ICO_SIZES.map(async (size) => ({
              size,
              data: await sharp(Buffer.from(svg))
                .resize(size, size)
                .png({ compressionLevel: 9 })
                .toBuffer(),
            })),
          ),
        ),
      );
    }
  }
}
