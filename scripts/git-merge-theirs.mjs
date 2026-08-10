import { copyFileSync } from "node:fs";

// Registered as the `theirs` merge driver (see scripts/setup-git-merge-drivers.mjs and
// .gitattributes). Git invokes this as `driver %A %B` and expects the merged result written
// to %A. Always taking %B (the incoming branch) is safe only because this repo merges in one
// direction — upstream/main into custom — so "incoming" always means "upstream's copy".
const [, , ours, theirs] = process.argv;
copyFileSync(theirs, ours);
