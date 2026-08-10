# Release

All workspaces share one version and release together.

## Two steps

A release has exactly two steps. The agent does the first, the user authorizes the second.

**Preparation** (local, reversible — agent does this):

- format, lint, typecheck all green
- resolve the release source to one commit and confirm that commit's existing CI is green
- classify the diff from the previous stable to the release source as patch or minor, then show the
  target version and rationale to the user
- draft the changelog, show it to the user, wait for review
- run the pre-release sanity check, surface findings to the user

**Go-ahead** (user says "go ahead"):

- commit the approved release inputs locally
- run the release, which publishes npm and pushes the prepared branch and tag
- create the release heartbeat immediately and babysit it to completion

Rules that apply to both steps:

- Last-minute changes always need approval. Every time.
- No code changes bundled into the changelog commit or the release commit. Code shims live in their own commit, reviewed on their own merits.
- A sanity-check finding is information, not a directive. The agent surfaces it; the user decides.
- Invoking a release skill is intent to start the flow, not blanket authorization to publish.
- If the user asks for a release preview, show the prospective changelog/release contents and answer questions, but do not commit, tag, publish, or run release commands until they explicitly authorize the release.

## Release source and CI

The default release source is `origin/main`. Fetch `origin`, then record the
resolved commit. The default release checkout is a clean local `main` whose
`HEAD` equals `origin/main`.

An explicit user instruction can select another ref, such as a hotfix commit or
tag. Resolve that ref once and apply every source, diff, and CI check to that
commit instead of `origin/main`.

Before making release-preparation commits, confirm the existing CI run for the
resolved commit is green. Pending CI is watched to completion. Release
preparation then stays local through the changelog, any explicitly requested ACP
catalog update, lockfile preparation, and the version commit. After approval,
commit the prepared inputs locally and run the release command. Its branch and
tag push is the one remote release batch and starts CI for the complete release
commit.

## ACP catalog updates

ACP catalog work enters a release through an explicit user request:

- **Check ACP drift** — run `npm run acp:version-drift:check`. When drift exists,
  run `npm run acp:version-drift:update`, verify the catalog, and include the
  update in the local release-preparation commits.
- **Update ACP** — run `npm run acp:version-drift:update`, verify the catalog, and
  include the update in the local release-preparation commits.

The release authorization covers the requested ACP commit. It ships in the same
release push as the changelog and version commit.

## Two paths

There are two supported ways to ship:

1. **Direct stable release**: ship from `main` to everyone immediately.
2. **Beta flow**: ship from `custom` as release candidates on the `beta` channel. Betas carry an in-place changelog entry (beta users check it), publish npm only on the explicit `beta` dist-tag, and never become the website's default download — they sit behind the Stable/Beta switch on `/download`.

The release scripts enforce that split:

- stable release commands only run from `main`
- beta release commands only run from `custom`

Paseo has one linear release track even though npm dist-tags are independent
pointers. The npm invariant is:

- A beta release moves only `beta`; `latest` remains on the newest stable.
- A stable release moves both `latest` and `beta` to that stable version. This
  keeps users who install `@unbrokenhunter_/cli@beta` on the newest Paseo release after
  a beta is promoted or superseded by a direct stable release.

## Release version decision

Every fresh release starts by classifying the full diff from the previous
stable to the resolved release source. The highest-impact change determines the
version:

- **Minor** — a user would experience the release as a significant upgrade. This
  includes substantial new workflows, providers, forges, platforms, integrations,
  or meaningful expansions of existing capabilities. Foundational internal work
  also qualifies when it materially changes reliability, performance,
  compatibility, deployment, or operation; diff size alone does not.
- **Patch** — fixes, polish, small enhancements, and reliability or performance
  improvements within existing capabilities. Follow-up corrections to a minor
  release are patches.

The release agent selects patch or minor during preparation and presents the
target version with the changelog for approval. Agents never select a major
version autonomously. A major release requires an explicit user instruction and
approval; Paseo remains on major version zero until that deliberate decision.

Version bumps are never used to retry a failed build. Retry the existing version
as described in **Fixing a failed release build**.

## Standard release (stable)

Before running any stable release command:

- Make sure the resolved release source passed CI, the approved release inputs are committed locally on the intended branch, and the working tree is clean.
- **Run `npm run format`, `npm run lint`, and `npm run typecheck` and commit any resulting changes BEFORE you start any `release:*` command.** `release:check` runs `npm install --workspaces --include-workspace-root` as part of `release:prepare`, which can mutate `package-lock.json` (e.g. churning `"dev": true` markers on optional deps). The next step, `version:all:*`, runs `npm version` which aborts when the working tree is dirty. If this happens mid-flight you have to commit the lockfile churn before retrying — and the pre-commit format hook will reject a lockfile-only commit because oxfmt internally skips `package-lock.json` while lefthook's glob still matches it. Avoid the whole mess by running format/lint/typecheck first, then `release:prepare` once on its own to absorb any lockfile churn into a normal commit, then start the release.
- Do not use a release command as a substitute for checking whether the current commit is actually ready.

```bash
# Run exactly one, matching the approved decision:
npm run release:patch
npm run release:minor
```

This bumps the version across all workspaces, runs checks, and pushes the branch + tag. The tag push triggers `NPM Publish`, `Desktop Release`, `Android APK Release`, `Docker`, and `Release Notes Sync` on GitHub Actions. EAS picks up the same tag via the EAS GitHub app and starts the iOS + Android store builds in parallel (see "Mobile builds (EAS)" below) — there is no `release-mobile.yml` in this repo.

`NPM Publish` publishes from `.github/workflows/npm-publish.yml`. See
"npm scope" below for how this fork's packages get their published names.

After the stable release succeeds, move npm's `beta` pointer to the new stable
version for every published package. This changes dist-tags only; do not
republish the packages:

```bash
PASEO_VERSION=$(node -p "require('./package.json').version")
for package in highlight relay protocol client server cli; do
  npm dist-tag add "@unbrokenhunter_/$package@$PASEO_VERSION" beta
done
```

Verify both npm tags now resolve to `PASEO_VERSION` before considering the
stable release complete.

The Docker workflow builds images from the checked-out source tree on pull requests and on `main` as non-publishing checks. Stable `vX.Y.Z` tag pushes publish `ghcr.io/getpaseo/paseo:X.Y.Z` and `ghcr.io/getpaseo/paseo:latest`; beta `vX.Y.Z-beta.N` tag pushes publish only `ghcr.io/getpaseo/paseo:X.Y.Z-beta.N` and never move `latest`.

The production relay is the Elixir service in [getpaseo/paseo-relay](https://github.com/getpaseo/paseo-relay), with its own deployment process. Paseo releases and pushes to this repository do not deploy it. The Cloudflare relay code and workflow in this repository are legacy and are not used in production.

## npm scope

The source tree names every package `@getpaseo/*`, but that scope belongs to
upstream's npm account and this fork cannot publish to it. `NPM Publish` runs
`scripts/rewrite-npm-scope.mjs` to rename the scope to `$PASEO_NPM_SCOPE`
(`@unbrokenhunter_`) in the CI checkout, immediately before publishing.

The rewrite happens in CI rather than in the source tree so that merges from
upstream do not conflict on every file that imports a workspace package. Its
placement in the job is load-bearing: after `npm ci`, because it renames the
`node_modules` scope directory instead of reinstalling, and before
`npm publish`, because each package's `prepack` rebuilds `dist` from source.
The publish step therefore selects workspaces by path, not by name.

Set `PASEO_NPM_SCOPE` in the workflow to change the published scope.

The same rewrite renames the CLI command via `PASEO_CLI_COMMAND`, so the
published package installs as `paseoplus` and does not collide with upstream's
`paseo` on the same machine. It rewrites the `bin` key and the commander program
name, which is what every generated usage line is derived from; a few hardcoded
`Usage: paseo ...` strings still say `paseo`. Local dev, `npm run cli`, and the
tests are untouched and keep using `paseo`.

### Bootstrapping a new scope

`NPM Publish` authenticates with trusted publishing (OIDC) and needs no stored
credential. But npm cannot register a trusted publisher for a package that does
not exist yet, and the npmjs.com UI has no way to configure one in advance
([npm/cli#8544](https://github.com/npm/cli/issues/8544)). A brand-new scope
therefore has to be seeded once from a workstation:

```bash
npm login                                  # interactive, satisfies 2FA
node scripts/rewrite-npm-scope.mjs @your-scope
for package in highlight relay protocol client server cli; do
  npm publish --workspace="packages/$package" --access public --tag beta
done
git checkout -- .                          # discard the rewrite
```

Then register the workflow as each package's trusted publisher and drop back to
OIDC for every release after that:

```bash
for package in highlight relay protocol client server cli; do
  npm trust github "@your-scope/$package" --file npm-publish.yml --repo <owner>/paseo \
    --allow-publish --yes
done
```

`--allow-publish` needs npm 12 or newer locally. Configurations created after
May 20, 2026 must name at least one allowed action, and npm 11's `npm trust` has
no flag for it, so it posts a config the registry rejects with a bare
`E400 Bad Request` that names nothing. npm 12 fails loudly instead. Trusted
publishing errors are misleading in general
([npm/cli#9088](https://github.com/npm/cli/issues/9088)) — a publish that hits
`ENEEDAUTH` in CI usually means no trusted publisher is registered, not a
credential problem.

Prefer this over storing a long-lived automation token: those bypass 2FA, and
npm's own guidance is to use trusted publishing for CI. The workflow still reads
an optional `NPM_TOKEN` secret if one is set, for the window before a package has
a trusted publisher.

Trusted publishing needs npm >= 11.5.1, which is newer than the npm bundled with
the pinned Node version, so the workflow upgrades npm before publishing.

**Stable means stable.** If the user says "stable" or "ship stable", do not ask whether they want a beta first. They picked stable; treat it as a direct stable release. Only run the beta flow when the user explicitly says "beta".

## Manual step-by-step

```bash
npm run typecheck            # Verify the exact commit you intend to release
npm run release:check        # Typecheck, build, dry-run pack
# Run exactly one approved version command:
npm run version:all:patch
npm run version:all:minor
npm run release:push         # Push HEAD + tag (triggers CI workflows)
# GitHub Actions publishes npm packages from the tag push via trusted publishing.
# Then move npm's beta dist-tag to this stable version using the command above.
```

## Beta flow

### Fork preflight

Run beta releases from the `custom` worktree. Do not infer the worktree from the
conversation or from another checkout:

```bash
git worktree list --porcelain
git branch --show-current                # custom
git status --short --branch              # clean, tracking origin/custom
git remote get-url origin                # https://github.com/UnbrokenHunter/paseo.git
git rev-parse HEAD
git rev-parse origin/custom              # same commit as HEAD
```

Always pass the fork explicitly to `gh`. GitHub CLI can select `upstream` from a
multi-remote checkout even when `origin` is the fork.

Confirm release credentials before creating a tag:

```bash
gh secret list --repo UnbrokenHunter/paseo --json name --jq '.[].name'
```

- `EXPO_TOKEN` is required by `Android APK Release` and must access the Expo
  project in `packages/app`
- npm uses trusted publishing for the six `@unbrokenhunter_/*` packages;
  `NPM_TOKEN` is optional after the trusted publishers are registered
- GitHub supplies `GITHUB_TOKEN` to the artifact workflows
- Apple signing/notarization secrets are optional; when absent, the desktop
  workflow removes the empty variables and builds without notarization credentials

Run the exact `custom` commit through CI. Pushes to `custom` do not start the
full CI workflow automatically, so dispatch it and wait for the result:

```bash
git push origin custom
gh workflow run ci.yml --repo UnbrokenHunter/paseo --ref custom
gh run list --repo UnbrokenHunter/paseo --workflow ci.yml --branch custom --limit 1
gh run watch <run-id> --repo UnbrokenHunter/paseo --exit-status
```

Do not add symlinked instruction or documentation files inside runtime
workspaces. Electron Builder traverses workspace package files and can fail on
links that work in a Windows checkout but resolve differently while packaging
on clean Windows, Linux, or macOS runners.

On Windows, Lefthook may run through Git's `sh` with a PATH that cannot resolve
`npm`, even though PowerShell can. If a commit fails only with `sh: npm: command
not found`, run `npm run format`, `npm run lint`, and `npm run typecheck`
directly, confirm they pass, then use `git commit --no-verify`. Do not bypass a
hook that reached a check and reported a source or test failure.

### Cut and observe a beta

```bash
npm run release:beta:patch       # Start the next patch beta line
npm run release:beta:minor       # Start the next minor beta line
# ... test desktop and APK prerelease assets from GitHub Releases ...
npm run release:beta:next        # Optional: cut X.Y.Z-beta.2, beta.3, ...
npm run release:promote          # Promote X.Y.Z-beta.N to stable X.Y.Z
```

These commands run local release checks, create the version commit and tag, and
push both. They do not publish npm packages or build installers in the local
process. The `v*` tag starts five GitHub workflows: `NPM Publish`, `Desktop
Release`, `Android APK Release`, `Docker`, and `Release Notes Sync`.

Monitor the tag workflows rather than treating a successful local command as a
completed release:

```bash
tag="v$(node -p "require('./package.json').version")"
gh run list --repo UnbrokenHunter/paseo --branch "$tag" --limit 10
gh release view "$tag" --repo UnbrokenHunter/paseo
```

Verify the fork registry scope after `NPM Publish` succeeds:

```bash
for package in highlight relay protocol client server cli; do
  npm view "@unbrokenhunter_/$package" dist-tags --json
done
```

For a beta, every `beta` tag must equal the released version and `latest` must
remain unchanged. A tag retry is safe: `NPM Publish` skips versions already in
the registry after confirming the intended `beta` or `latest` dist-tag is
already correct.

- Beta tags are published GitHub prereleases like `v0.1.41-beta.1`
- Betas publish npm packages with `--tag beta` from `NPM Publish`, so `npm install @unbrokenhunter_/cli@beta` opts in while plain `npm install @unbrokenhunter_/cli` stays on `latest`
- Betas publish desktop assets and APKs for testing. They also build iOS, upload it to TestFlight, add it to the `Paseo Beta` external group, and submit it for Beta App Review. They do not submit mobile builds to the production stores.
- `release:promote` creates a fresh stable tag like `v0.1.41`; the final release never reuses the beta tag
- Desktop assets now come from the Electron package at `packages/desktop`
- This fork's desktop artifacts, installed application, executable, app ID, deep-link scheme, updater repository, and optional CLI integration are branded `PaseoPlus`/`paseoplus`; internal `@getpaseo/*` workspace names remain unchanged for upstream compatibility
- Beta releases use Electron's `beta` update channel. Users on the stable channel only receive stable releases; users on the beta channel receive beta releases and the final stable release when it is published.
- **Each beta carries its own changelog entry.** `Release Notes Sync` mirrors the matching `## X.Y.Z-beta.N` entry into that prerelease body. Promotion collapses every beta entry for the version into one final stable entry. See the Changelog policy section.

Use the beta path when you need to:

- smoke a build yourself before promoting it to everyone
- test a build manually in a Linux or Windows VM
- send a build to a user who is hitting a specific problem
- iterate on `beta.1`, `beta.2`, `beta.3`, and so on before deciding to ship broadly

## Staged rollout (stable channel)

Stable desktop releases go out via a linear time-based rollout for automatic update checks: 0% admitted when the updater manifests appear, 100% admitted 36 hours later, linear ramp in between. Manual checks bypass the rollout so a user can install immediately when they click **Check**. Beta releases bypass the rollout entirely — beta users always receive updates immediately.

The rollout is driven by a `rolloutHours` field stamped into the GitHub Release manifests (`latest-mac.yml`, `latest-linux.yml`, `latest.yml`) by the `finalize-rollout` job in `desktop-release.yml`.

Desktop release builds now publish in two phases:

- Platform build jobs upload the installers/packages (`.dmg`, `.zip`, `.exe`, `.AppImage`, etc.) to the GitHub release.
- The final job merges/stamps the manifests and uploads all `.yml` files only after they already contain the final `releaseDate` and `rolloutHours`.

Updater clients only discover a release through those `.yml` manifests, so there is no silent 100% admission window before rollout metadata is present.

### Default behavior

`npm run release:patch` or `npm run release:minor` → tag push → 36h ramp. No extra action needed. The npm publish happens in GitHub Actions through trusted publishing.

The `rollout_hours` input on `desktop-release.yml` is **only read on `workflow_dispatch`** — tag-push runs always default to 36. To get any other rollout duration on a fresh release, use the post-publish flip below.

### Instant-admit release (rollout_hours=0 from publish)

For a fresh release that should admit everyone immediately (low-risk change, doc-only, hotfix, or just a release you want out fast), cut the release normally and queue the rollout flip immediately after:

```bash
# 1. Cut and publish (default 36h ramp from tag push).
npm run release:patch

# 2. Immediately queue the flip — runs as soon as finalize-rollout completes.
gh workflow run desktop-rollout.yml \
  -f tag=v0.1.64 \
  -f rollout_hours=0
```

**Why this is gap-free:** `desktop-release.yml`'s `finalize-rollout` job and `desktop-rollout.yml` share the concurrency group `desktop-rollout-<tag>`. Dispatching `desktop-rollout.yml` while the tag-push pipeline is still running queues it safely behind `finalize-rollout`. The first public manifests already carry `rolloutHours=36`, then `desktop-rollout.yml` flips them to `rolloutHours=0` shortly afterward. The renderer polls every 30 minutes, so active stable users pick up the new manifest on their next check.

Run the dispatch right after `release:patch` or `release:minor` returns. Don't wait for the tag-push CI to finish.

### Adjusting an already-published release

To change the rollout duration on a release that's already shipped — e.g. flip a hotfix to instant admit, or slow a release down — use the dedicated `desktop-rollout.yml` workflow. It edits the manifests in place on the GitHub release without rebuilding anything. It only rewrites `rolloutHours`; `releaseDate` is preserved, so the rollout clock keeps ticking from the original publish time.

**Hotfix (instant admit) on an already-shipped release:**

```bash
gh workflow run desktop-rollout.yml \
  -f tag=v0.1.42 \
  -f rollout_hours=0
```

`rollout_hours=0` admits 100% of stable users on their next update check (within ~30 min for active clients).

**Slow a rollout down** (e.g. extend total duration to 72h since the original release):

```bash
gh workflow run desktop-rollout.yml \
  -f tag=v0.1.42 \
  -f rollout_hours=72
```

`rollout_hours` is **total duration since the original release date**, not "extend by N more hours from now." If `v0.1.42` was published 2h ago and you set `rollout_hours=72`, the ramp finishes 70h from now.

The dispatch is idempotent and shares the `desktop-rollout-<tag>` concurrency group with `desktop-release.yml`'s `finalize-rollout` job, so it serializes safely against an in-flight tag-push pipeline targeting the same release.

### Custom ramp on a manually-dispatched build

`desktop-release.yml` accepts `rollout_hours` only on `workflow_dispatch`, which is the path used to **rebuild an existing tag** (retry a failed release, force a rebuild on a different ref). When you go that route, you can stamp a non-default ramp directly:

```bash
gh workflow run desktop-release.yml \
  -f tag=v0.1.43 \
  -f rollout_hours=6
```

This does **not** apply to fresh releases cut via `npm run release:patch` or `npm run release:minor` — those paths always tag-push and stamp 36. For a fresh release with a custom ramp, cut normally and then dispatch `desktop-rollout.yml` (same pattern as the instant-admit flow above, with your chosen `rollout_hours`).

### Releasing during an active rollout

If you ship N+1 while N is still ramping, N+1 starts a fresh rollout from its own publish timestamp. N's rollout effectively ends — the newer manifest supersedes it. Rollout-aware clients revalidate the manifest for up to five seconds before installing a downloaded update on quit. If N+1 has replaced N but the client is not admitted to N+1 yet, it skips the downloaded N and waits rather than installing two updates in succession. If revalidation times out, the app exits without installing the cached update.

If N+1 is a hotfix for a bug in N, dispatch `desktop-rollout.yml -f tag=v0.1.<N+1> -f rollout_hours=0` after N+1 publishes so the users who already got N reach the fix fast.

### Limitations

- **No pause / kill switch.** To stop new admissions, ship a superseding release. Clients revalidate on quit and will not install the superseded download, but a client that already completed installation cannot be recalled; ship a hotfix `+1` patch.
- **No rollback.** `allowDowngrade = false`. Bad release = ship a hotfix.
- **Bootstrap caveat.** Clients running a build older than the rollout feature ignore `rolloutHours` and admit immediately. Rollout protection only applies to clients running the rollout-aware version or later.
- **Up to ~30 min automatic admission latency.** Renderer polls every 30 minutes, so a stable user may take up to that long to be evaluated against the rollout window. Clicking **Check** is manual and bypasses rollout admission.

## Mobile builds (EAS)

iOS and Android store builds are not in `.github/workflows`. They are triggered by the EAS GitHub app the moment the `v*` tag is pushed:

- **Android (Play Store)** — EAS builds with profile `production` and auto-submits to the Play Store via `eas submit` (EAS-managed credentials, no Fastlane).
- **iOS (TestFlight + App Store)** — EAS builds with profile `production`, uploads to TestFlight, and a Fastlane lane submits the build for App Store review.
- **Android APK (GitHub Release asset)** — separate, via `.github/workflows/android-apk-release.yml`. This is the only Android-related workflow that lives in this repo.

EAS uses the local app version source. `packages/app/app.config.js` derives the native version from the package version. Android `versionCode` is `major * 1_000_000 + minor * 1_000 + patch`. iOS reserves 1,000 build slots per app version: beta `N` uses slot `N`, and stable uses slot `999`. For example, `0.2.6-beta.2` appears in App Store Connect as version `0.2.6` build `2006002`; stable uses build `2006999`. Rebuilding the same tag produces the same native build number; if a store has already accepted a binary and you need a different binary, cut the next beta or patch instead of relying on EAS remote auto-increment.

Beta tags run `Release iOS Beta`. The workflow uploads the build to TestFlight, distributes it to the persistent `Paseo Beta` external group, and submits it for Beta App Review. Testers and the group are managed once in App Store Connect; releases require no dashboard action.

There is no mobile-release workflow under `.github/workflows`. The EAS GitHub app reads the workflows under `packages/app/.eas/workflows` and handles tag triggering directly.

### Watching mobile builds from the terminal

Use the EAS CLI from `packages/app/`:

```bash
cd packages/app

# Recent builds (newest first). Pipe to jq for status only.
npx eas build:list --limit 8 --non-interactive --json | jq '.[] | {platform, status, appVersion, gitCommitHash}'

# Recent EAS workflow runs. This is the source of truth for submit/review jobs.
npx eas workflow:runs --json | jq '.[] | {status, workflowName, trigger, gitCommitHash, startedAt, finishedAt}'

# Filter by platform.
npx eas build:list --platform ios --limit 5 --non-interactive --json
npx eas build:list --platform android --limit 5 --non-interactive --json

# Inspect a specific build.
npx eas build:view <build-id>

# Inspect the full release workflow, including submit_ios, submit_android,
# and submit_ios_for_review.
npx eas workflow:view <workflow-run-id> --json

# Read failed submit/review job logs.
npx eas workflow:logs <workflow-job-id> --all-steps --non-interactive

# Stream logs for a build.
npx eas build:view <build-id> --json | jq '.logFiles[]'
```

A build's `gitCommitHash` must match the release tag commit. `status` walks through `NEW` → `IN_QUEUE` → `IN_PROGRESS` → `FINISHED` (or `ERRORED`/`CANCELED`). The EAS workflow run's `gitCommitHash` and `trigger` must also match the release tag.

Once a build is `FINISHED`, EAS still has release-critical work to do: Android must submit to the Play Store, and iOS must upload to TestFlight **and** submit the build for App Store review. The release is not done until all platforms are on their way through the stores.

For the `Release Mobile` EAS workflow, these jobs must pass:

- `build_ios` — iOS binary built
- `submit_ios` — iOS binary uploaded to App Store Connect/TestFlight
- `submit_ios_for_review` — iOS build submitted for App Store review via Fastlane
- `build_android` — Android store binary built
- `submit_android` — Android binary submitted to the Play Store

Do not treat `build_ios: SUCCESS` or `submit_ios: SUCCESS` as a completed iOS release. `submit_ios_for_review: FAILURE` means the iOS release is blocked even if the build is visible in TestFlight.

To confirm the submission landed, inspect the EAS workflow with `npx eas workflow:view <workflow-run-id> --json`. App Store Connect (review state for the matching version/build) and the Play Console track are the final ground truth.

## Release completion and heartbeat

A release is **in progress** after npm publication and tag push. Report it as
**shipped** only after every applicable build, publication, asset, manifest, and
store submission passes the completion checklist.

Immediately after every beta, stable, or promotion tag push, create a heartbeat
that resumes the release in the current conversation. Create it automatically
with `create_heartbeat`. The heartbeat owns the release until it either reaches
the completion checklist or finds a failure that needs new user authority.

Each heartbeat checks the release tag commit, all GitHub Actions runs for the
release branch and tag, npm dist-tags, the GitHub Release body and assets,
desktop updater manifests, the published Docker image, and the applicable EAS
workflow. Inspect the GitHub Release itself and confirm that the macOS, Linux,
Windows, and Android APK assets are present along with the channel manifests
(`latest-mac.yml`, `latest-linux.yml`, and `latest.yml` for stable;
`beta-mac.yml`, `beta-linux.yml`, and `beta.yml` for beta).

For stable releases, also confirm every required mobile build, upload, store
submission, and review-submission job for the release commit. For betas, confirm
the beta EAS workflow completed its TestFlight distribution and Beta App Review
path. Delete the heartbeat only after every applicable checklist item passes,
then report the release as shipped.

Pattern:

```jsonc
// mcp__paseo__create_heartbeat arguments
{
  "name": "vX.Y.Z release babysit heartbeat",
  "cron": "*/10 * * * *",
  "timezone": "UTC",
  "maxRuns": 120,
  "expiresIn": "24h",
  "prompt": "Resume the vX.Y.Z release babysit for commit <sha>. Check npm tags; every GitHub Actions run for the release branch and tag; the published GitHub Release body, expected desktop/APK assets, and channel manifests; the Docker image; and the matching EAS workflow. Completion requires every applicable checklist item. For stable, require build_ios, submit_ios, submit_ios_for_review, build_android, and submit_android to succeed. For beta, require the beta TestFlight distribution and Beta App Review path. If work is pending, wait for the next heartbeat. If a failure can be retried safely for the same version, follow the failed-release procedure; otherwise report the blocker. When every applicable completion-checklist item passes, delete THIS heartbeat, report shipped, and stop.",
}
```

Run an immediate status check after creating the heartbeat. The heartbeat handles
later transitions and stops itself when the release is complete.

## Release notes on GitHub

The GitHub Release body is populated automatically by the `Release Notes Sync` workflow (`.github/workflows/release-notes-sync.yml`). It triggers on every `v*` tag push and on any push to `main` that touches `CHANGELOG.md`, then runs `scripts/sync-release-notes-from-changelog.mjs` to mirror the matching changelog entry into the release body. You don't need to write release notes on GitHub manually — keep `CHANGELOG.md` correct and the workflow will sync it. To force a re-sync, dispatch the workflow with the tag input.

## Website behavior

- The website download page defaults to GitHub's latest published **stable** release.
- A published beta prerelease is offered behind the Stable/Beta switch on `/download` (`?channel=beta`), never as the default. The switch only appears while the newest prerelease leads stable on its core version, so promoting `X.Y.Z-beta.N` to `X.Y.Z` retires the beta channel from the page until the next beta line opens.
- Homebrew, the Play Store, the App Store, and `app.paseo.sh` have no beta. The Beta view drops those rows, and the whole Web section, rather than showing an inert "stable only" placeholder. When a surface gains a beta path — say a public TestFlight link — add its row back in `packages/website/src/routes/download.tsx`.
- The default download target only moves when you publish the final stable release tag like `v0.1.41`.
- The public `/changelog` page renders `CHANGELOG.md` as-is, so the in-flight `-beta.N` entry shows there once it lands on `main` — that's intended, it's where beta users check what's coming. Only the **default download target** stays pinned to the latest stable; the download links read GitHub's releases API, not the changelog, so a `-beta.N` heading on top never affects them.
- The download page's "What's new" link deep-links the **minor group** anchor (`/changelog#release-0.3`), not the exact entry: promotion collapses the beta entries into one stable entry, so the minor group remains the durable target. A version with no entry in the bundled changelog — a tag whose changelog commit hasn't redeployed the site yet — links the plain `/changelog` instead of a dead anchor.
- The website itself is deployed by `Deploy Website` (Cloudflare Workers), which redeploys on `release: published` for non-prerelease releases and on pushes to `main` that touch `CHANGELOG.md` or `packages/website/**`.

## Fixing a failed release build

**NEVER bump the version to fix a build problem.** New versions are reserved for meaningful product changes (features, fixes, improvements). Build/CI failures are fixed on the current version.

**Do not rely on `workflow_dispatch` for tagged code fixes.** The `workflow_dispatch` trigger runs the workflow file from the default branch but checks out the code at the tag ref (`ref: ${{ inputs.tag }}`). That means fixes committed to `main` won't change the tagged source tree being built. `workflow_dispatch` only helps when the fix lives in the workflow file itself.

For Docker-only retries, **do not push or force-push a `v*` release tag**.
`v*` tag pushes rebuild desktop assets, the Android APK, Docker, release notes,
and EAS mobile release builds. Use the Docker workflow dispatch instead:

```bash
gh workflow run docker.yml \
  --ref main \
  -f paseo_version=X.Y.Z-beta.N \
  -f publish=true
```

This replaces `ghcr.io/getpaseo/paseo:X.Y.Z-beta.N` in place without touching
desktop, APK, or EAS release builders. The Docker exception is safe because the
dispatch runs from `--ref main` and uses the explicit `paseo_version`; it does
not check out or move the `v*` release tag.

To retry a failed non-Docker release workflow, push a retry tag on the commit
you want to build. Reusing the same tag name is expected: move it with
`git tag -f ...` and push it with `--force` so the workflow rebuilds the commit
you actually want.

Prefer a tag push over `workflow_dispatch` when rebuilding desktop or APK
release assets. Prefer Docker workflow dispatch when rebuilding only the Docker
image.

The retry tag patterns below still work and remain the supported way to rebuild specific release targets:

```bash
# Desktop (all platforms)
git tag -f desktop-v0.1.28 HEAD && git push origin desktop-v0.1.28 --force

# Desktop (single platform)
git tag -f desktop-macos-v0.1.28 HEAD && git push origin desktop-macos-v0.1.28 --force
git tag -f desktop-linux-v0.1.28 HEAD && git push origin desktop-linux-v0.1.28 --force
git tag -f desktop-windows-v0.1.28 HEAD && git push origin desktop-windows-v0.1.28 --force

# Android APK
git tag -f android-v0.1.28 HEAD && git push origin android-v0.1.28 --force

# Beta
git tag -f v0.1.29-beta.2 HEAD && git push origin v0.1.29-beta.2 --force
```

This ensures the checkout ref matches the actual code on the release branch
with the fix included. For this fork, beta fixes land on `custom`; stable fixes
land on `main`.

If the tagged source is correct and one hosted job fails transiently, do not
move the tag. Retry only failed jobs:

```bash
gh run rerun <run-id> --failed --repo UnbrokenHunter/paseo
gh run watch <run-id> --repo UnbrokenHunter/paseo --exit-status
```

`hdiutil: create failed - Device not configured` on a macOS runner is a known
transient disk-image failure. Retry that failed job before changing source.

If source must change after the version is published, commit the fix to the
release branch, push the branch, then move the same annotated release tag. Do
not create a new version for a build-only fix:

```bash
git tag -fa vX.Y.Z-beta.N -m vX.Y.Z-beta.N HEAD
git push origin custom
git push origin vX.Y.Z-beta.N --force
```

Moving a `v*` tag reruns every tag workflow. npm versions are immutable, so the
publish workflow skips existing packages whose dist-tags are already correct.
Artifact uploads use `--clobber` and replace files on the existing GitHub
prerelease.

- `vX.Y.Z` or `vX.Y.Z-beta.N` rebuilds the full tagged release
- `desktop-vX.Y.Z` rebuilds desktop for all desktop platforms only
- `desktop-macos-vX.Y.Z`, `desktop-linux-vX.Y.Z`, and `desktop-windows-vX.Y.Z` rebuild only that desktop platform
- `android-vX.Y.Z` rebuilds the Android APK release only

## Notes

- `version:all:*` bumps root + syncs workspace versions and `@getpaseo/*` dependency versions
- `release:prepare` refreshes workspace `node_modules` links to prevent stale types
- `npm run dev:desktop` and `npm run build:desktop` target the Electron desktop package in `packages/desktop`
- If `NPM Publish` partially fails, rerun the workflow or push the same tag again; it skips already-published versions after verifying their intended dist-tag
- If `Android APK Release` reports that an Expo account is required, configure the repository's `EXPO_TOKEN` secret before retrying; changing application code does not fix authentication
- The website uses GitHub's latest published release API for download links, so published beta prereleases do not replace the stable download target.

## Changelog format

Release notes depend on the changelog heading format. The heading **must** be strictly followed:

```
## X.Y.Z - YYYY-MM-DD
## X.Y.Z-beta.N - YYYY-MM-DD
```

No prefix (`v`), no extra text. `Release Notes Sync` matches the `## X.Y.Z` (or `## X.Y.Z-beta.N`) line for the pushed tag to extract the version. A malformed heading breaks the release-notes sync for that tag.

## Changelog policy

- `CHANGELOG.md` includes stable releases and every entry in the current beta series.
- The first beta of a version inserts a top entry like `## 0.1.60-beta.1 - YYYY-MM-DD`.
- Each subsequent beta inserts a new top entry with the next beta number. Its notes cover the changes since the previous beta tag.
- Stable promotion replaces every beta entry for that version with one `## 0.1.60 - YYYY-MM-DD` entry.
- The promoted stable entry covers the full diff from the previous stable tag and collapses internal iterations across the beta series.

## Changelog ownership

- **The agent running the release writes the changelog entry — beta or stable.** The release context and final wording stay with that agent.
- For the first beta or a direct stable release, draft from the previous stable tag to the release source. For later betas, draft from the previous beta tag to the release source. Promotion replaces the beta series with one entry drafted from the previous stable tag to the release source. Review the result against the changelog policy below, show it to the user, and wait for approval before committing it.

## Changelog voice

The changelog is shown on the Paseo homepage. Write it for **end users**, not developers.

- **Frame everything from the user's perspective.** Describe what changed in the app, not what changed in the code. Users care that "workspaces load instantly" — not that a component no longer remounts.
- **Never mention component names, internal modules, or implementation details.** No `WorkingIndicator`, no `accumulatedUsage`, no `reconcileAndEmitWorkspaceUpdates`. Also no "virtualized lists", no "remount", no "memoization", no "debounced", no "fuzzy ranking", no "controlled input", no "uncontrolled input" — these are implementation words masquerading as user-facing copy.
- **Concrete WRONG → RIGHT examples** (real mistakes from past releases):

  | Wrong (implementation-facing)                                                       | Right (user-facing)                                         |
  | ----------------------------------------------------------------------------------- | ----------------------------------------------------------- |
  | Switching layouts no longer remounts the active agent                               | Splitting a pane no longer loses your scroll position       |
  | Model, mode, and thinking pickers — searchable virtualized lists with fuzzy ranking | Mobile model selector is faster and more straightforward    |
  | Text inputs in mobile sheets no longer flicker while typing fast                    | Typing in mobile sheets no longer flickers                  |
  | Compact web sheets no longer crash when swiped to dismiss                           | Sheets on mobile web no longer crash when swiped to dismiss |
  | Reduced re-renders in the agent list                                                | Agent list scrolls smoothly                                 |
  | Added debouncing to the search input                                                | Search results no longer lag behind typing                  |

  Test: would a non-developer reader recognise what changed when using the app? If they'd need an engineer to translate ("what's a remount?"), the bullet is still implementation-facing — rewrite it as the symptom the user experiences.

- **Use the entry's release scope.** Include changes within the matching range in **Changelog scope**.
- **Collapse internal iterations within that scope.** Present a feature added and fixed in one range as working. A later beta can describe a fix to behavior delivered in an earlier beta; promotion folds the complete beta series into the final stable behavior.
- **Cut low-signal entries.** "Toolbar buttons have consistent sizing" is too granular. Combine small polish items or drop them.

## Changelog conciseness

Every bullet must be scannable at a glance. The changelog is not release documentation — it's a list.

- **One sentence per bullet, max.** If a bullet contains two sentences, the second one is doing work that belongs in product docs, not the changelog. Cut it.
- **No trailing periods.** Bullets are list items, not prose. Drop the period at the end of every bullet, including the period inside any bolded lead-in. `**Configurable terminal scrollback**` not `**Configurable terminal scrollback.**`.
- **One line per bullet.** If a bullet wraps to three lines in a narrow column, it's too long.
- **Split bullets that pack multiple distinct changes.** If a bullet uses "and", "plus", a comma list, or an em-dash to chain several independent improvements, break them into separate bullets — even when they share a theme or author. One bullet = one user-facing change.
- **Trim qualifying clauses.** Drop "with a hint shown when…", "matching the CLI's behaviour", "across common install shapes". If the detail doesn't change whether a user cares, cut it.
- **Lead with what the user can do, not the mechanism.** The reader cares about the capability, not how it works under the hood. Do not explain LAN vs WAN, TLS handshakes, IPC, the daemon-relay topology, or any internal concept the user has not asked about. "Self-hosted relays can use a different TLS setting for the public endpoint" — not "Self-hosted relays support a separate TLS setting for the public endpoint, so the daemon can reach the relay over the LAN while the phone reaches it over the public secure address." If a feature genuinely needs background to be understood, it belongs in product docs, with a one-line teaser in the changelog.
- **Lead with the outcome.** "Windows: agents launch reliably from npm `.cmd` shims…" is better than "Windows: agents launch reliably across common install shapes. Claude, Codex, and OpenCode now start correctly…".
- **Attribution follows the split.** When you split a dense bullet, move each PR/author to the bullet it belongs to. Never duplicate the same PR across multiple bullets.

## Changelog attribution

Every changelog bullet must credit contributors and link to the PR(s) that delivered the change. This is not one-PR-per-line — a single bullet describes a user-facing change and may reference multiple PRs.

Format: append `([#123](https://github.com/getpaseo/paseo/pull/123) by [@user](https://github.com/user))` at the end of each bullet. For changes spanning multiple PRs or contributors:

```markdown
- Voice mode now works on tablets with proper microphone permissions. ([#210](https://github.com/getpaseo/paseo/pull/210), [#215](https://github.com/getpaseo/paseo/pull/215) by [@alice](https://github.com/alice), [@bob](https://github.com/bob))
```

Rules:

- **Always link the PR number** as `[#N](https://github.com/getpaseo/paseo/pull/N)`.
- **Always link the contributor's GitHub profile** as `[@user](https://github.com/user)`.
- **One bullet = one user-facing change**, regardless of how many PRs went into it. Group related PRs on the same bullet.
- **De-duplicate contributors.** If the same person authored multiple PRs in one bullet, list them once.
- **Only credit external contributors.** Skip attribution for [@boudra](https://github.com/boudra). The changelog credits community contributions — core team work is the default.
- **Credit the commit author, not the PR opener.** A maintainer often opens a PR that lands work authored by someone else (cherry-pick, rebase of a contributor's branch, manual extraction from a stacked PR). The squash commit preserves the original commit's author, but `gh pr view N --json author` returns the PR opener — using that field will silently mis-credit the work to the maintainer (and then the "skip @boudra" rule drops the attribution entirely). Always resolve attribution from commit authors.

  Use this command to get the GitHub logins for each PR:

  ```bash
  gh pr view N --json commits --jq '[.commits[].authors[].login] | unique | .[]'
  ```

  This returns every distinct GitHub login that authored or co-authored a commit in the PR. Use those logins for attribution. Fall back to `gh pr view N --json author` only if the commits command returns nothing (which should not happen for merged PRs).

  When listing PR numbers, `git log --format='%H %s' v<previous>..<release-source-sha> | grep -E '\(#[0-9]+\)$'` pulls the PR number out of squash commit subjects.

## Changelog ordering

Entries within each section (Added, Improved, Fixed) are ordered by user impact:

1. **User-facing features and changes first** — things users will notice, want to try, or that change their workflow.
2. **Quality-of-life improvements** — polish, performance, smoother interactions.
3. **Internal/infra changes last** — only include if they have a tangible user benefit (e.g. "faster startup" is user-facing even if the fix was internal).

## Pre-release sanity check

Before cutting a **stable** release, the release agent reviews the diff as a last line of defence against shipping bugs. Skip this for betas — the beta itself is the smoke test, and gating each beta on a code review defeats the point of using betas as fast release candidates.

Review the diff between the latest release tag and the resolved release source. Focus on:

1. **Breaking changes** — especially in the WebSocket protocol, agent lifecycle, and any server↔client contract.
2. **Backward compatibility** — the important direction is old app clients talking to newly updated daemons. Users update desktop and daemon first, then keep running the old app for a while. Flag anything that breaks old clients against new daemons or requires both sides to update in lockstep.
3. **Regressions** — anything that looks like it could break existing functionality.

Use `git diff <latest-release-tag>..<release-source-sha>` as the review input. This is a deep sanity check, not a full code review. If anything looks risky, investigate before proceeding and surface the finding to the user.

## Changelog scope

Changelog scope follows the release being described:

- **First beta**: `previous stable tag → release source`
- **Later beta**: `previous beta tag → release source`
- **Direct stable release**: `previous stable tag → release source`
- **Stable promotion**: replace the full beta series with one entry covering `previous stable tag → release source`

Each beta entry records what its testers receive. Promotion produces the single stable record for the full jump from one stable version to the next.

## Completion checklist

### Beta release

- [ ] The active worktree is on `custom`, `origin` is `UnbrokenHunter/paseo`, the working tree is clean, and `HEAD` equals `origin/custom`
- [ ] `EXPO_TOKEN` exists in the fork's Actions secrets and npm trusted publishing is configured for all six `@unbrokenhunter_/*` packages
- [ ] Update the in-place beta entry in `CHANGELOG.md` (heading `## X.Y.Z-beta.N - YYYY-MM-DD`), review it against the changelog policy, get approval, and commit it before cutting the release
- [ ] The previous-stable-to-`HEAD` diff is classified as patch or minor, with the target version and rationale approved
- [ ] `npm run release:beta:patch`, `npm run release:beta:minor`, or `npm run release:beta:next` completes successfully
- [ ] The release tag resolves to the intended `custom` commit and all tag-triggered workflows are monitored to completion
- [ ] npm shows the version under the `beta` dist-tag, not `latest`
- [ ] The GitHub prerelease exists with the changelog body and every expected macOS, Linux, Windows, and Android APK asset
- [ ] GitHub `Desktop Release` workflow for the `v*-beta.N` tag is green
- [ ] The GitHub prerelease contains `beta-mac.yml`, `beta-linux.yml`, and `beta.yml`
- [ ] GitHub `Android APK Release` workflow for the same tag is green
- [ ] GitHub `Docker` workflow is green and the versioned beta image is published without moving `latest`
- [ ] GitHub `Release Notes Sync` mirrored the beta entry into the prerelease body
- [ ] EAS `Release iOS Beta` completed its build, TestFlight distribution, external beta group, and Beta App Review path
- [ ] The release heartbeat was created after the tag push and deleted only after every item above passed

### Stable release (or promotion)

- [ ] Run the pre-release sanity check (see above) and address any findings
- [ ] The diff from the previous stable to the resolved release source is classified as patch or minor, with the target version and rationale approved
- [ ] The resolved release source is the intended commit (default `origin/main`) and its existing CI is green
- [ ] Ensure the approved release inputs are committed locally and the git worktree is clean before running any release command
- [ ] Ensure local `npm run typecheck` passes on that exact commit before running any release command
- [ ] Update `CHANGELOG.md` with user-facing release notes (features, fixes — not refactors). Promotion replaces every `## X.Y.Z-beta.N` entry in the series with one `## X.Y.Z - YYYY-MM-DD` entry covering the full release
- [ ] Verify the changelog heading follows strict `## X.Y.Z - YYYY-MM-DD` format
- [ ] Release preparation stayed local until the approved release command pushed the complete branch and tag
- [ ] `npm run release:patch`, `npm run release:minor`, or `npm run release:promote` completes successfully
- [ ] Every GitHub Actions run for the complete release commit and tag is green
- [ ] Move npm's `beta` dist-tag to the new stable version for every published package and verify both `latest` and `beta` resolve to it
- [ ] The published GitHub Release exists with the changelog body and every expected macOS, Linux, Windows, and Android APK asset
- [ ] GitHub `Desktop Release` workflow for the `v*` tag is green
- [ ] The GitHub Release contains `latest-mac.yml`, `latest-linux.yml`, and `latest.yml`
- [ ] GitHub `Android APK Release` workflow for the same tag is green
- [ ] GitHub `Docker` workflow is green and both the versioned and `latest` images are published
- [ ] GitHub `Release Notes Sync` is green and the release body matches the stable changelog entry
- [ ] EAS `Release Mobile` workflow for the same tag is green
- [ ] EAS iOS `build_ios` completes for the same tag
- [ ] EAS iOS `submit_ios` succeeds, uploading the build to App Store Connect/TestFlight
- [ ] EAS iOS `submit_ios_for_review` succeeds, putting the build into App Store review
- [ ] EAS Android `build_android` completes for the same tag
- [ ] EAS Android `submit_android` succeeds, putting the build on its Play Store track
- [ ] The release heartbeat was created after the tag push and deleted only after every item above passed
