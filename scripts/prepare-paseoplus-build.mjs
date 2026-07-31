import fs from "node:fs";
import path from "node:path";

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+(?:-beta\.\d+)?$/.test(version ?? "")) {
  throw new Error("Usage: node scripts/prepare-paseoplus-build.mjs <semver>");
}

const root = process.cwd();

const mainPath = path.join(root, "packages", "desktop", "src", "main.ts");
let main = fs.readFileSync(mainPath, "utf8");

const mainReplacements = [
  ['const APP_SCHEME = "paseo";', 'const APP_SCHEME = "paseoplus";'],
  [
    'const APP_NAME = process.env.PASEO_TEST_APP_NAME?.trim() || "Paseo";',
    'const APP_NAME = process.env.PASEO_TEST_APP_NAME?.trim() || "PaseoPlus";',
  ],
];

for (const [before, after] of mainReplacements) {
  if (!main.includes(before)) {
    throw new Error(`Expected source text not found in ${mainPath}: ${before}`);
  }
  main = main.replace(before, after);
}
fs.writeFileSync(mainPath, main);

// The packaged renderer runs at paseoplus://app. The daemon's WebSocket
// origin allowlist must include that origin or every connection is rejected
// with HTTP 403 during the WebSocket upgrade.
const bootstrapPath = path.join(root, "packages", "server", "src", "server", "bootstrap.ts");
let bootstrap = fs.readFileSync(bootstrapPath, "utf8");
const paseoOrigin = '    "paseo://app",';
const paseoPlusOrigin = '    "paseoplus://app",';
if (!bootstrap.includes(paseoOrigin)) {
  throw new Error(`Expected Paseo desktop origin not found in ${bootstrapPath}`);
}
if (!bootstrap.includes(paseoPlusOrigin)) {
  bootstrap = bootstrap.replace(paseoOrigin, `${paseoOrigin}\n${paseoPlusOrigin}`);
}
fs.writeFileSync(bootstrapPath, bootstrap);

// Keep every bundled workspace on the same release version. The desktop
// compares its version with the managed daemon version and otherwise restarts
// the daemon on every launch due to a permanent mismatch.
const rootPackagePath = path.join(root, "package.json");
const rootPackage = JSON.parse(fs.readFileSync(rootPackagePath, "utf8"));
const packagePaths = [
  rootPackagePath,
  ...(Array.isArray(rootPackage.workspaces)
    ? rootPackage.workspaces.map((workspace) => path.join(root, workspace, "package.json"))
    : []),
];

for (const packagePath of packagePaths) {
  const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
  pkg.version = version;
  fs.writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);
}

console.log(`Prepared PaseoPlus ${version}`);
