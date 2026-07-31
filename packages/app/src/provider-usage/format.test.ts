import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatCompactUsage, formatResetInLabel, formatUsageSummary } from "./format";

const NOW = new Date("2026-07-31T12:00:00.000Z");

function inHours(hours: number): string {
  return new Date(NOW.getTime() + hours * 3_600_000).toISOString();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("formatResetInLabel", () => {
  it("counts down in the largest whole unit", () => {
    expect(formatResetInLabel(inHours(3))).toBe("resets in 3h");
    expect(formatResetInLabel(inHours(0.5))).toBe("resets in 30m");
    expect(formatResetInLabel(inHours(72))).toBe("resets in 3d");
  });

  it("says the reset is happening once the deadline passes", () => {
    expect(formatResetInLabel(inHours(-1))).toBe("resetting now");
  });

  it("returns null when there is no reset time to show", () => {
    expect(formatResetInLabel(null)).toBeNull();
    expect(formatResetInLabel(undefined)).toBeNull();
    expect(formatResetInLabel("not-a-date")).toBeNull();
  });
});

describe("formatUsageSummary", () => {
  it("reads as remaining percentage then reset countdown", () => {
    expect(formatUsageSummary({ remainingPct: 78, resetsAt: inHours(3) })).toBe(
      "78% remaining · resets in 3h",
    );
  });

  it("rounds the percentage to a whole number", () => {
    expect(formatUsageSummary({ remainingPct: 77.6, resetsAt: null })).toBe("78% remaining");
  });

  it("omits the countdown when the limit has no reset time", () => {
    expect(formatUsageSummary({ remainingPct: 12, resetsAt: null })).toBe("12% remaining");
  });
});

describe("formatCompactUsage", () => {
  it("returns the percent and duration for i18n interpolation", () => {
    expect(formatCompactUsage({ remainingPct: 78.4, resetsAt: inHours(3) })).toEqual({
      percent: 78,
      duration: "3h",
    });
  });

  it("omits the duration when the limit has no reset time", () => {
    expect(formatCompactUsage({ remainingPct: 12, resetsAt: null })).toEqual({
      percent: 12,
      duration: null,
    });
  });

  it("omits the duration once the reset deadline has passed", () => {
    expect(formatCompactUsage({ remainingPct: 12, resetsAt: inHours(-1) })).toEqual({
      percent: 12,
      duration: null,
    });
  });
});
