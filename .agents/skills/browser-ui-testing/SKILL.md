---
name: browser-ui-testing
description: Verify a UI change by driving the real Paseo web app in a browser. Use when asked to check that a UI change works, take a screenshot of the app, debug an animation or a layout problem, check the mobile/compact layout, or record a video or GIF of an interaction. Also use before claiming any UI work is done.
user-invocable: true
---

# Browser UI testing

Read `docs/browser-ui-testing.md` and follow it. It covers the isolated instance, the two ways
to drive the app, animation sampling, video capture, and responsive layout.

Three things decide how the session goes, so settle them first.

**Is an isolated instance already up?** Check `curl -s -o /dev/null -w '%{http_code}'
http://127.0.0.1:6799/api/health` and the Metro port before starting anything. Bringing up a
second stack on a taken port crashloops the daemon. Never point testing at the daemon on
`6767` — it manages the user's real agents, and restarting it kills your own process if you are
one of them.

**Are you in a worktree?** If the checkout you are serving from is the same one anyone might
build in, Metro will start throwing 500s for missing `packages/*/dist` files partway through
and each recovery costs a `--clear` restart. Set the worktree up before you need it, not after
it breaks.

**Snapshot or screenshot?** Default to `browser_snapshot`. Take pixels when the question is
visual — layout, spacing, overflow, color, z-order — and when you need evidence for
`docs/qa.md`. Screenshots cost roughly four times a snapshot and carry less state.

For animation work, use `npm run ui:probe --workspace=@getpaseo/app` and read the sampled
values. Do not try to judge motion from stills. Sample a control transition in the same run, or
you cannot tell a broken animation from one whose trigger conditions were never met.

Report what you actually observed. A screenshot of the right screen is not evidence that the
interaction worked.
