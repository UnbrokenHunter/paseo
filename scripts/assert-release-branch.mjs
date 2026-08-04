#!/usr/bin/env node

import { execFileSync } from "node:child_process";

const mode = process.argv[2];
const expectedBranches = {
  stable: process.env.PASEO_RELEASE_STABLE_BRANCH?.trim() || "main",
  beta: process.env.PASEO_RELEASE_BETA_BRANCH?.trim() || "custom",
};

if (!mode || !(mode in expectedBranches)) {
  process.stderr.write(
    `Usage: node scripts/assert-release-branch.mjs <stable|beta>\n` +
      `Expected branches: stable=${expectedBranches.stable}, beta=${expectedBranches.beta}\n`,
  );
  process.exit(1);
}

const currentBranch = execFileSync("git", ["branch", "--show-current"], {
  encoding: "utf8",
}).trim();

if (!currentBranch) {
  process.stderr.write("Release branch check failed: unable to determine the current branch.\n");
  process.exit(1);
}

const expectedBranch = expectedBranches[mode];
if (currentBranch !== expectedBranch) {
  process.stderr.write(
    `Release branch check failed: ${mode} releases must run from ${expectedBranch}, but the current branch is ${currentBranch}.\n`,
  );
  process.exit(1);
}
