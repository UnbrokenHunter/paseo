# Browser UI Testing

How to drive the real app in a browser to verify a UI change: an isolated instance to test
against, two ways to drive it, and how to capture evidence for [qa.md](qa.md).

This is hands-on verification of a change you just made. It is not a substitute for a test.
Anything worth checking twice belongs in the Playwright browser suite —
`packages/app/e2e/browser/`, run with `npm run test:e2e --workspace=@getpaseo/app`. See
[testing.md](testing.md) for the suites, the file-naming rules that route them, and the bar for
what counts as real coverage. A manual pass proves the change works now; a spec proves it keeps
working, which is question four of [qa.md](qa.md).

For native device testing — Agent Device, Maestro, the iOS simulator — see
[mobile-testing.md](mobile-testing.md). For the Electron compositor fixtures that verify the
screenshot machinery itself, see [browser-capture-harness.md](browser-capture-harness.md).

## Run an isolated instance

Never point UI testing at the daemon on `6767`. That one manages real agents, and an agent that
restarts it kills its own process.

**Use a git worktree, not the main checkout.** Package imports resolve to compiled `dist/`
output (see [development.md](development.md#built-workspace-packages)), so a `build:clean` or a
watch rebuild anywhere in the checkout deletes files out from under a running Metro. Metro then
caches the failed resolution and serves 500s until you restart it with `--clear`, which costs
several minutes. A separate `PASEO_HOME` does not help — the collision is over build artifacts,
not state.

```bash
git worktree add ../paseo-uitest -b agent/ui-testing
cd ../paseo-uitest && npm ci
```

Then start a daemon and Metro with their own home and ports:

```bash
PASEO_HOME="$PWD/.dev/agent-home" PASEO_LISTEN=127.0.0.1:6799 PASEO_CORS_ORIGINS='*' \
  npm run dev:server:raw
EXPO_PUBLIC_LOCAL_DAEMON=localhost:6799 BROWSER=none APP_VARIANT=development \
  npm run start:expo --workspace=@getpaseo/app -- --port 8091
```

Write `$PASEO_HOME/config.json` yourself before the first start —
`{"version":1,"daemon":{"listen":"127.0.0.1:6799","cors":{"allowedOrigins":["*"]}}}`. The dev
scripts only generate it when they own the home.

Confirm isolation from the daemon's boot log: `materializedWorkspaces: 0` and
`Agent registry loaded (0 records)`. An empty "No projects yet" screen is the visual
confirmation.

Seed it with a workspace over the CLI. `--host` is a subcommand flag, not a global one:

```bash
npx tsx packages/cli/src/index.js workspace create \
  --host localhost:6799 --isolation local --path /tmp/scratch --title "UI Test" --json
```

The CLI needs `@getpaseo/server` built (`npm run build --workspace=@getpaseo/server`); the
daemon itself runs from source and does not.

### On Windows

`npm run dev:server` and `npm run dev:app` are `./scripts/*.sh` invoked through cmd.exe and fail
with `'"node"' is not recognized`. They also hard-pin `PASEO_LISTEN` through `cross-env`, so
exporting your own port before calling them does nothing. Call `dev:server:raw` and
`start:expo` directly, as above, or use `scripts/dev.ps1` if the default ports suit you.

Never set `PASEO_DEV_SEED_HOME`. It defaults to copying `~/.paseo`, which puts the user's real
projects and agents into your "isolated" instance.

## Driving it

### Paseo browser tools — the default

The `mcp__paseo__browser_*` tools drive resident webviews in the desktop app: navigate, click,
type, keypress, scroll, drag, upload, ARIA snapshot, page JS, console and network logs, and
screenshots. Refs come from the latest `browser_snapshot` and expire on any DOM change, so
re-snapshot after each interaction.

**Prefer `browser_snapshot` over `browser_screenshot`.** A snapshot is a few hundred tokens of
text; a screenshot is around 1,750. The snapshot also carries information pixels don't —
accessible names, `selected`, `expanded` — which is how an untranslated i18n key gets caught
instead of rendering as a plausible-looking icon button. Reach for pixels when the question is
layout, spacing, overflow, color, or z-order.

Do not use browser history. Navigate by clicking or with `browser_navigate` and a full URL —
the app uses client-side routing and history breaks state.

**Read `browser_logs` before calling something working.** A screen that looks right can be
sitting on a failed request or a React error, and neither shows up in a screenshot. Check it
after the interaction you care about, not only at load. There is a standing baseline of noise —
require-cycle warnings, `useNativeDriver`, a `uniProps` prop warning — so look for what changed
rather than for silence.

### `ui:probe` — video, animation, and viewport

`packages/app/scripts/ui-probe.mjs` drives the running app with Playwright for the three things
the MCP tools can't do: record video, sample animation frames, and set an exact viewport
independent of the desktop window.

```bash
PASEO_UI_PROBE_URL=http://localhost:8091 \
PASEO_UI_PROBE_WIDTH=390 PASEO_UI_PROBE_HEIGHT=844 \
PASEO_UI_PROBE_WORKSPACE="UI Test" \
PASEO_UI_PROBE_TRIGGER="Select model" \
PASEO_UI_PROBE_OUT=.dev/probe-mobile \
  npm run ui:probe --workspace=@getpaseo/app
```

It writes screenshots, a `.webm` recording, and `animation-samples.json`, and prints a count of
style transitions per element.

## Animations

Reanimated on web writes to inline styles, so a `requestAnimationFrame` loop reading
`getComputedStyle` sees the real interpolated values. That is what `ui:probe` samples, and it
beats both screenshots and video for debugging: you get exact per-frame timing, the easing
shape, and whether a value settles or jitters, for a fraction of the tokens. A verified run
captured a spinner's rotation matrix across 267 consecutive frames and a `workspace-hover-card`
fade at `opacity 0.79 → 0.37 → 0.17`.

Sample a control transition you can trigger on demand in the same run. Without one, "no motion"
and "the technique cannot see this animation" look identical.

Check the trigger conditions in the source before concluding an animation is broken. Several
are gated on data the mock providers never produce — the provider usage meter cross-fades only
when the account reports more than one limit, and its marquee scrolls only when the label
overflows its container, so both sit still under the Mock Load Test provider no matter what the
UI does.

## Video and GIF without spending tokens

`ui:probe` records `.webm` per run. Convert it for a human without ever looking at a frame:

```bash
ffmpeg -i out.webm -vf "fps=10,scale=720:-1:flags=lanczos" -loop 0 anim.gif
```

A 435 KB recording becomes a ~138 KB GIF. Use this to hand a reviewer a moving artifact when
the reviewer, not you, is the one who needs to see it. Viewing frames yourself costs ~1,750
tokens each, so sample a handful around the transition rather than scrubbing.

## Responsive and mobile layout

`useIsCompactFormFactor` reads Unistyles breakpoints only
(`packages/app/src/constants/layout.ts`), and compact is anything under `md` — 720px. A narrow
browser viewport therefore renders the genuine compact layout: collapsed sidebar behind the
hamburger, stacked full-width cards. Use `browser_resize`, or `PASEO_UI_PROBE_WIDTH` for an
exact device size.

Below the breakpoint the sidebar is not on screen, so a script that clicks a workspace row has
to open the hamburger first.

This covers layout regressions and nothing else. Everything `isNative`-gated is invisible here:
haptics, push tokens, camera, `StatusBar.currentHeight`, safe-area insets, real touch, native
gesture handling, and Reanimated running on the native UI thread. Hover is web-only, so
hover-to-show controls behave differently on device by design. Those need
[mobile-testing.md](mobile-testing.md).

## Themes

Unistyles runs with `adaptiveThemes`, so the app follows `prefers-color-scheme`. Set
`PASEO_UI_PROBE_COLOR_SCHEME=light` (default `dark`) to render either theme, and check both
whenever you touch color, borders, or elevation. Verified both ways at 1280x800.

The MCP browser tools inherit the desktop app's scheme instead, so a screenshot taken there and
one taken by the probe can disagree on theme without anything being wrong.

## Performance

"Does it stutter" is part of the [qa.md](qa.md) bar and none of the tools here answer it. Use
the gated React render profiler — `?renderProfile=1` and the workflow in
[development.md](development.md#react-render-profiling) — and record an idle baseline before
blaming an interaction. For terminal latency specifically, see
[terminal-performance.md](terminal-performance.md).

## Gotchas

**Metro 500s after any build in the checkout.** The error names a missing
`packages/*/dist/*.js`. The file usually exists again by the time you look — Metro cached the
failure. Restart it with `--clear`. Use a worktree so it stops happening.

**A blank page with a healthy bundle** means Metro is still bundling. The first cold bundle
after `--clear` takes several minutes.

**`Starting inspector on 127.0.0.1:9229 failed`** in daemon output is harmless when another
daemon already holds the debug port. `EADDRINUSE` on the daemon's own listen port is not — the
worker will crashloop until you free it.

**`screenshot_no_frame`** ("The tab has not painted yet") meant a resident webview had lost its
copyable compositor surface, permanently for that tab. Fixed in `98e99bdbb`. If it returns:
every other tool still works on the dead tab, so keep driving it and open a fresh tab on the
same URL when you need pixels — app state lives in the URL and localStorage. `fullPage: true`
is not a workaround; it shares the same frame-capture path.
