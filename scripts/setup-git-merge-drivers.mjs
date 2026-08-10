import { execFileSync } from "node:child_process";

// Registers the `theirs` merge driver used by .gitattributes for CHANGELOG.md. Driver
// commands live in git config, not .gitattributes, so every checkout has to run this once —
// `npm run prepare` (via `npm install`) is that hook, matching how lefthook installs itself.
execFileSync("git", ["config", "merge.theirs.driver", "node scripts/git-merge-theirs.mjs %A %B"]);
