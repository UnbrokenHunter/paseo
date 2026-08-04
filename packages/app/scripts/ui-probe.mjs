// Drives the running web app in a real browser to capture UI evidence:
// screenshots at any viewport, a video recording, and per-frame samples of
// animated style values.
//
// The animation sampler is the reason this exists. Reanimated on web writes to
// inline styles, so a requestAnimationFrame loop reading getComputedStyle sees
// the real interpolated values — exact durations and easing shape, which a
// screenshot cannot show and a video can only show to a human.
//
//   PASEO_UI_PROBE_URL=http://localhost:8091 \
//   PASEO_UI_PROBE_WIDTH=390 \
//     npm run ui:probe --workspace=@getpaseo/app
//
// See docs/browser-ui-testing.md.

import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const baseUrl = process.env.PASEO_UI_PROBE_URL ?? "http://localhost:8091";
const width = Number(process.env.PASEO_UI_PROBE_WIDTH ?? 1440);
const height = Number(process.env.PASEO_UI_PROBE_HEIGHT ?? 900);
const outDir = process.env.PASEO_UI_PROBE_OUT ?? ".dev/ui-probe-out";
// Text of a sidebar workspace row to open before probing. Unset stays on the picker.
const openWorkspace = process.env.PASEO_UI_PROBE_WORKSPACE?.trim();
// Accessible name of a control to click while the sampler runs.
const triggerName = process.env.PASEO_UI_PROBE_TRIGGER?.trim();
const sampleMs = Number(process.env.PASEO_UI_PROBE_SAMPLE_MS ?? 3000);
// Unistyles runs with adaptiveThemes, so prefers-color-scheme picks the app theme.
const colorScheme = process.env.PASEO_UI_PROBE_COLOR_SCHEME ?? "dark";

mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width, height },
  deviceScaleFactor: 1,
  colorScheme,
  recordVideo: { dir: outDir, size: { width, height } },
});
const page = await context.newPage();
page.setDefaultTimeout(90_000);
page.on("pageerror", (error) => console.error("[page]", String(error).slice(0, 300)));

await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
try {
  await page.waitForFunction(() => document.body.innerText.length > 0, null, { timeout: 90_000 });
} catch (error) {
  await page.screenshot({ path: `${outDir}/00-stuck.png` });
  console.error(
    "App never rendered. Check that Metro is serving a bundle, not a 500 — see docs/browser-ui-testing.md.",
  );
  throw error;
}
await page.waitForTimeout(2_500);

if (openWorkspace) {
  const row = page.getByText(openWorkspace, { exact: false }).first();
  if (await row.isVisible().catch(() => false)) {
    await row.click();
    await page.waitForTimeout(2_500);
  } else {
    // Below the compact breakpoint the sidebar is behind the hamburger, so a
    // workspace row is not on screen at all.
    console.warn(`Workspace "${openWorkspace}" not visible at ${width}px wide.`);
  }
}
await page.screenshot({ path: `${outDir}/01-initial.png` });

// Start sampling before the trigger fires, so the opening frames are captured.
const sampling = page.evaluate((durationMs) => {
  const out = [];
  const t0 = performance.now();
  const seen = new WeakMap();
  return new Promise((resolve) => {
    const tick = () => {
      for (const el of document.querySelectorAll("*")) {
        const style = getComputedStyle(el);
        const value = `${style.opacity}|${style.transform}`;
        const previous = seen.get(el);
        if (previous !== undefined && previous !== value) {
          out.push({
            t: Math.round(performance.now() - t0),
            key: el.getAttribute?.("data-testid") || String(el.tagName),
            from: previous,
            to: value,
          });
        }
        seen.set(el, value);
      }
      if (performance.now() - t0 > durationMs || out.length > 2_000) return resolve(out);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}, sampleMs);

await page.waitForTimeout(300);
if (triggerName) {
  const trigger = page.getByRole("button", { name: new RegExp(triggerName, "i") }).first();
  if (await trigger.isVisible().catch(() => false)) {
    await trigger.click({ timeout: 3_000 }).catch(() => {});
  } else {
    console.warn(`Trigger "${triggerName}" not found.`);
  }
}

const samples = await sampling.catch(() => []);
await page.waitForTimeout(800);
await page.screenshot({ path: `${outDir}/02-final.png` });

writeFileSync(`${outDir}/animation-samples.json`, JSON.stringify(samples, null, 2));

const byElement = new Map();
for (const sample of samples) {
  byElement.set(sample.key, (byElement.get(sample.key) ?? 0) + 1);
}

await context.close();
await browser.close();

console.log(
  JSON.stringify(
    {
      viewport: `${width}x${height}`,
      colorScheme,
      compactLayout: width < 720,
      transitions: samples.length,
      elements: Object.fromEntries(byElement),
      outDir,
    },
    null,
    2,
  ),
);
