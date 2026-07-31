import { describe, expect, it } from "vitest";
import {
  findProviderUsage,
  rotationOrder,
  selectActiveAccountUsage,
  toUsageLimits,
  type ProviderUsageLimit,
} from "./active-account";
import type {
  ProviderUsage,
  ProviderUsageListPayload,
  ProviderUsageView,
  ProviderUsageWindow,
} from "./types";

const FETCHED_AT = "2026-07-31T12:00:00.000Z";

function providerUsage(overrides: Partial<ProviderUsage> = {}): ProviderUsage {
  return {
    providerId: "claude",
    displayName: "Claude",
    status: "available",
    planLabel: "Max",
    windows: [],
    ...overrides,
  };
}

function readyView(
  providers: ProviderUsage[],
  refreshError: string | null = null,
): ProviderUsageView {
  const payload: ProviderUsageListPayload = {
    requestId: "req-1",
    fetchedAt: FETCHED_AT,
    providers,
  };
  return {
    kind: "ready",
    payload,
    lastFetchedAt: FETCHED_AT,
    isRefreshing: false,
    refreshError,
  };
}

function usageWindow(
  overrides: Partial<ProviderUsageWindow> & { id: string },
): ProviderUsageWindow {
  return { label: overrides.id, ...overrides };
}

function ids(limits: ProviderUsageLimit[]): string[] {
  return limits.map((limit) => limit.id);
}

describe("findProviderUsage", () => {
  const providers = [
    providerUsage({ providerId: "Claude" }),
    providerUsage({ providerId: "codex" }),
  ];

  it("matches the provider id ignoring case", () => {
    expect(findProviderUsage(providers, "claude")?.providerId).toBe("Claude");
    expect(findProviderUsage(providers, "CODEX")?.providerId).toBe("codex");
  });

  it("returns null when the provider has no usage row", () => {
    expect(findProviderUsage(providers, "copilot")).toBeNull();
  });

  it("returns null when there is no active provider", () => {
    expect(findProviderUsage(providers, null)).toBeNull();
    expect(findProviderUsage(providers, undefined)).toBeNull();
    expect(findProviderUsage(providers, "")).toBeNull();
  });
});

describe("toUsageLimits", () => {
  it("derives the remaining percentage from usedPct", () => {
    const limits = toUsageLimits(
      providerUsage({
        windows: [usageWindow({ id: "5h", label: "Session", usedPct: 22, resetsAt: FETCHED_AT })],
      }),
    );

    expect(limits).toEqual([
      {
        id: "5h",
        label: "Session",
        source: "window",
        usedPct: 22,
        remainingPct: 78,
        resetsAt: FETCHED_AT,
        runsOutAt: null,
        tone: "default",
      },
    ]);
  });

  it("derives the used percentage when only remainingPct is reported", () => {
    const limits = toUsageLimits(
      providerUsage({ windows: [usageWindow({ id: "weekly", remainingPct: 12 })] }),
    );

    expect(limits[0]).toMatchObject({ usedPct: 88, remainingPct: 12 });
  });

  it("prefers usedPct over remainingPct so the bar and the summary agree", () => {
    const limits = toUsageLimits(
      providerUsage({ windows: [usageWindow({ id: "5h", usedPct: 30, remainingPct: 55 })] }),
    );

    expect(limits[0]).toMatchObject({ usedPct: 30, remainingPct: 70 });
  });

  it("clamps percentages outside 0..100", () => {
    const limits = toUsageLimits(
      providerUsage({
        windows: [
          usageWindow({ id: "over", usedPct: 140 }),
          usageWindow({ id: "under", usedPct: -20 }),
        ],
      }),
    );

    expect(limits).toMatchObject([
      { id: "over", usedPct: 100, remainingPct: 0 },
      { id: "under", usedPct: 0, remainingPct: 100 },
    ]);
  });

  it("drops windows that report no percentage at all", () => {
    const limits = toUsageLimits(
      providerUsage({
        windows: [
          usageWindow({ id: "known", usedPct: 10 }),
          usageWindow({ id: "unknown", usedPct: null, remainingPct: null }),
          usageWindow({ id: "absent" }),
        ],
      }),
    );

    expect(ids(limits)).toEqual(["known"]);
  });

  it("keeps the provider's tone and derives one only when absent", () => {
    const limits = toUsageLimits(
      providerUsage({
        windows: [
          usageWindow({ id: "told", usedPct: 95, tone: "ok" }),
          usageWindow({ id: "derived", usedPct: 95 }),
        ],
      }),
    );

    expect(limits.map((limit) => limit.tone)).toEqual(["ok", "danger"]);
  });

  it("includes balances that carry a limit to measure against", () => {
    const limits = toUsageLimits(
      providerUsage({
        balances: [
          { id: "credits", label: "Credits", remaining: 25, limit: 100, unit: "credits" },
          { id: "spend", label: "Spend", used: 30, limit: 60, unit: "usd" },
        ],
      }),
    );

    expect(limits).toMatchObject([
      { id: "credits", source: "balance", usedPct: 75, remainingPct: 25 },
      { id: "spend", source: "balance", usedPct: 50, remainingPct: 50 },
    ]);
  });

  it("drops balances with no limit, a zero limit, or no measured value", () => {
    const limits = toUsageLimits(
      providerUsage({
        balances: [
          { id: "no-limit", label: "Credits", remaining: 25, unit: "credits" },
          { id: "zero-limit", label: "Credits", remaining: 25, limit: 0, unit: "credits" },
          { id: "no-value", label: "Credits", limit: 100, unit: "credits" },
        ],
      }),
    );

    expect(limits).toEqual([]);
  });

  it("lists windows before balances in the provider's own order", () => {
    const limits = toUsageLimits(
      providerUsage({
        windows: [
          usageWindow({ id: "5h", usedPct: 10 }),
          usageWindow({ id: "weekly", usedPct: 20 }),
        ],
        balances: [{ id: "credits", label: "Credits", used: 1, limit: 4, unit: "credits" }],
      }),
    );

    expect(ids(limits)).toEqual(["5h", "weekly", "credits"]);
  });
});

describe("rotationOrder", () => {
  function limit(overrides: Partial<ProviderUsageLimit> & { id: string }): ProviderUsageLimit {
    return {
      label: overrides.id,
      source: "window",
      usedPct: 0,
      remainingPct: 100,
      resetsAt: null,
      runsOutAt: null,
      tone: "default",
      ...overrides,
    };
  }

  it("puts the soonest projected exhaustion first", () => {
    const ordered = rotationOrder([
      limit({ id: "late", runsOutAt: "2026-07-31T20:00:00.000Z" }),
      limit({ id: "soon", runsOutAt: "2026-07-31T13:00:00.000Z" }),
    ]);

    expect(ids(ordered)).toEqual(["soon", "late"]);
  });

  it("ranks any projected exhaustion above a limit without one, whatever its usage", () => {
    const ordered = rotationOrder([
      limit({ id: "busy", usedPct: 99 }),
      limit({ id: "projected", usedPct: 5, runsOutAt: "2026-08-04T00:00:00.000Z" }),
    ]);

    expect(ids(ordered)).toEqual(["projected", "busy"]);
  });

  it("falls back to the highest used percentage when nothing projects exhaustion", () => {
    const ordered = rotationOrder([
      limit({ id: "low", usedPct: 12 }),
      limit({ id: "high", usedPct: 91 }),
      limit({ id: "mid", usedPct: 44 }),
    ]);

    expect(ids(ordered)).toEqual(["high", "mid", "low"]);
  });

  it("treats an unparseable runsOutAt as no projection", () => {
    const ordered = rotationOrder([
      limit({ id: "garbage", usedPct: 1, runsOutAt: "not-a-date" }),
      limit({ id: "real", usedPct: 1, runsOutAt: "2026-08-01T00:00:00.000Z" }),
    ]);

    expect(ids(ordered)).toEqual(["real", "garbage"]);
  });

  it("keeps the provider's order when limits tie", () => {
    const ordered = rotationOrder([
      limit({ id: "first", usedPct: 50 }),
      limit({ id: "second", usedPct: 50 }),
    ]);

    expect(ids(ordered)).toEqual(["first", "second"]);
  });

  it("does not mutate the input", () => {
    const input = [limit({ id: "a", usedPct: 1 }), limit({ id: "b", usedPct: 90 })];
    rotationOrder(input);

    expect(ids(input)).toEqual(["a", "b"]);
  });
});

describe("selectActiveAccountUsage", () => {
  it("reports loading while the first fetch is in flight", () => {
    const result = selectActiveAccountUsage({ view: { kind: "loading" }, providerId: "claude" });

    expect(result).toEqual({ state: "loading" });
  });

  it("reports the view error when there is nothing to fall back on", () => {
    const result = selectActiveAccountUsage({
      view: { kind: "error", message: "Update the host to see provider usage" },
      providerId: "claude",
    });

    expect(result).toEqual({
      state: "error",
      message: "Update the host to see provider usage",
      usage: null,
    });
  });

  it("is unavailable when the active provider has no usage row", () => {
    const result = selectActiveAccountUsage({
      view: readyView([providerUsage({ providerId: "codex" })]),
      providerId: "copilot",
    });

    expect(result).toEqual({ state: "unavailable", usage: null, reason: null });
  });

  it("keeps the provider's unavailable status distinct from a failed fetch", () => {
    const usage = providerUsage({
      providerId: "copilot",
      status: "unavailable",
      error: "Copilot reports no quota",
    });

    expect(selectActiveAccountUsage({ view: readyView([usage]), providerId: "copilot" })).toEqual({
      state: "unavailable",
      usage,
      reason: "Copilot reports no quota",
    });
  });

  it("surfaces the provider's own fetch failure as an error", () => {
    const usage = providerUsage({ status: "error", error: "401 from api.anthropic.com" });

    expect(selectActiveAccountUsage({ view: readyView([usage]), providerId: "claude" })).toEqual({
      state: "error",
      message: "401 from api.anthropic.com",
      usage,
    });
  });

  it("is unavailable when a provider claims availability but reports no numbers", () => {
    const usage = providerUsage({ windows: [usageWindow({ id: "5h", usedPct: null })] });

    expect(selectActiveAccountUsage({ view: readyView([usage]), providerId: "claude" })).toEqual({
      state: "unavailable",
      usage,
      reason: null,
    });
  });

  it("returns rotation-ordered limits with the closest to exhaustion first", () => {
    const usage = providerUsage({
      windows: [
        usageWindow({ id: "5h", label: "Session", usedPct: 22 }),
        usageWindow({ id: "weekly", label: "Weekly", usedPct: 64 }),
      ],
    });

    const result = selectActiveAccountUsage({ view: readyView([usage]), providerId: "claude" });
    if (result.state !== "available") throw new Error(`expected available, got ${result.state}`);

    expect(ids(result.limits)).toEqual(["weekly", "5h"]);
    expect(result.primary.id).toBe("weekly");
    expect(result.primary.remainingPct).toBe(36);
    expect(result.lastFetchedAt).toBe(FETCHED_AT);
    expect(result.usage).toBe(usage);
  });

  it("shows the last known numbers as stale when the newest refresh failed", () => {
    const usage = providerUsage({ windows: [usageWindow({ id: "5h", usedPct: 22 })] });

    const result = selectActiveAccountUsage({
      view: readyView([usage], "Host connection is not ready"),
      providerId: "claude",
    });
    if (result.state !== "stale") throw new Error(`expected stale, got ${result.state}`);

    expect(result.refreshError).toBe("Host connection is not ready");
    expect(result.primary.id).toBe("5h");
    expect(result.lastFetchedAt).toBe(FETCHED_AT);
  });

  it("prefers the provider's unavailable status over a stale refresh failure", () => {
    const usage = providerUsage({ providerId: "pi", status: "unavailable" });

    expect(
      selectActiveAccountUsage({ view: readyView([usage], "socket closed"), providerId: "pi" }),
    ).toEqual({ state: "unavailable", usage, reason: null });
  });
});
