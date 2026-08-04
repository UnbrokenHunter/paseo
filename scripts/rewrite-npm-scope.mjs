#!/usr/bin/env node

// Republish this fork's packages under an npm scope we actually own.
//
// The upstream scope (@getpaseo) belongs to upstream's npm account, so a fork can
// never publish to it. Rather than renaming the scope in the source tree -- which
// would conflict with upstream on nearly every file, forever -- we rewrite the
// scope in the ephemeral CI checkout right before `npm publish`.
//
// This must run AFTER `npm ci` and BEFORE `npm publish`, because:
//   - every publishable package has a `prepack` that rebuilds dist from source,
//     so rewriting built output alone would be undone by the publish itself
//   - `npm ci` has already created node_modules/@getpaseo/* workspace symlinks,
//     so the scope directory is renamed here instead of re-resolving the tree
//
// package-lock.json is deliberately left alone: nothing installs after this point,
// and rewriting it would only create a lockfile that matches no published tree.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const FROM_SCOPE = "@getpaseo";
const toScope = (process.env.PASEO_NPM_SCOPE || process.argv[2] || "").trim();

if (!toScope) {
  process.stderr.write(
    "Usage: node scripts/rewrite-npm-scope.mjs <@scope>  (or set PASEO_NPM_SCOPE)\n",
  );
  process.exit(1);
}
if (!/^@[a-z0-9][a-z0-9._-]*$/.test(toScope)) {
  process.stderr.write(`Invalid npm scope: ${toScope}\n`);
  process.exit(1);
}
if (toScope === FROM_SCOPE) {
  process.stderr.write(`Refusing to rewrite ${FROM_SCOPE} to itself.\n`);
  process.exit(1);
}

const SKIP = new Set(["package-lock.json"]);

const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: rootDir, encoding: "utf8" })
  .split("\0")
  .filter(Boolean)
  .filter((file) => !SKIP.has(file));

let changedFiles = 0;

for (const file of tracked) {
  const absolute = path.join(rootDir, file);
  if (!existsSync(absolute) || !statSync(absolute).isFile()) continue;

  const buffer = readFileSync(absolute);
  if (buffer.includes(0)) continue; // binary

  const before = buffer.toString("utf8");
  if (!before.includes(`${FROM_SCOPE}/`)) continue;

  const after = before.replaceAll(`${FROM_SCOPE}/`, `${toScope}/`);
  writeFileSync(absolute, after);
  changedFiles += 1;
}

// Keep workspace symlinks resolvable under the new scope.
const fromScopeDir = path.join(rootDir, "node_modules", FROM_SCOPE);
const toScopeDir = path.join(rootDir, "node_modules", toScope);
if (existsSync(fromScopeDir)) {
  rmSync(toScopeDir, { recursive: true, force: true });
  renameSync(fromScopeDir, toScopeDir);
}

console.log(`Rewrote ${FROM_SCOPE}/ -> ${toScope}/ in ${changedFiles} files`);

// Rename the installed command, so this fork's CLI does not collide with an
// upstream `paseo` on the same machine. Left alone by default: local dev, the
// docs, and the tests all keep using `paseo`.
const FROM_COMMAND = "paseo";
const toCommand = (process.env.PASEO_CLI_COMMAND || "").trim();

if (toCommand && toCommand !== FROM_COMMAND) {
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(toCommand)) {
    process.stderr.write(`Invalid CLI command name: ${toCommand}\n`);
    process.exit(1);
  }

  const cliPackagePath = path.join(rootDir, "packages", "cli", "package.json");
  const cliPackage = JSON.parse(readFileSync(cliPackagePath, "utf8"));
  cliPackage.bin = { [toCommand]: cliPackage.bin[FROM_COMMAND] };
  writeFileSync(cliPackagePath, `${JSON.stringify(cliPackage, null, 2)}\n`);

  // commander derives every generated usage/help line from the program name.
  const cliEntryPath = path.join(rootDir, "packages", "cli", "src", "cli.ts");
  const cliEntry = readFileSync(cliEntryPath, "utf8");
  const renamed = cliEntry.replace(`.name("${FROM_COMMAND}")`, `.name("${toCommand}")`);
  if (renamed === cliEntry) {
    process.stderr.write(`Could not find .name("${FROM_COMMAND}") in packages/cli/src/cli.ts\n`);
    process.exit(1);
  }
  writeFileSync(cliEntryPath, renamed);

  console.log(`Renamed CLI command ${FROM_COMMAND} -> ${toCommand}`);
}
