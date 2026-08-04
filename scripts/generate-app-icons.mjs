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
const source = await readFile(sourcePath, "utf8");

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
    }
  }
}
