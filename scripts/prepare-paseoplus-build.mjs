import fs from "node:fs";
import path from "node:path";

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+(?:-beta\.\d+)?$/.test(version ?? "")) {
  throw new Error("Usage: node scripts/prepare-paseoplus-build.mjs <semver>");
}

const root = process.cwd();
const mainPath = path.join(root, "packages", "desktop", "src", "main.ts");
let main = fs.readFileSync(mainPath, "utf8");

const replacements = [
  ['const APP_SCHEME = "paseo";', 'const APP_SCHEME = "paseoplus";'],
  [
    'const APP_NAME = process.env.PASEO_TEST_APP_NAME?.trim() || "Paseo";',
    'const APP_NAME = process.env.PASEO_TEST_APP_NAME?.trim() || "PaseoPlus";',
  ],
];

for (const [before, after] of replacements) {
  if (!main.includes(before)) {
    throw new Error(`Expected source text not found in ${mainPath}: ${before}`);
  }
  main = main.replace(before, after);
}
fs.writeFileSync(mainPath, main);

const packagePaths = [
  "package.json",
  "packages/desktop/package.json",
];
for (const relativePath of packagePaths) {
  const filePath = path.join(root, relativePath);
  const pkg = JSON.parse(fs.readFileSync(filePath, "utf8"));
  pkg.version = version;
  fs.writeFileSync(filePath, `${JSON.stringify(pkg, null, 2)}\n`);
}

console.log(`Prepared PaseoPlus ${version}`);
