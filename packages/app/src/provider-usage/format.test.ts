import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatAgeDuration, formatCompactUsage } from "./format";

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

describe("formatAgeDuration", () => {
  it("reports the age in the largest whole unit, with no 'ago' of its own", () => {
    expect(formatAgeDuration(inHours(-3))).toBe("3h");
    expect(formatAgeDuration(inHours(-0.5))).toBe("30m");
    expect(formatAgeDuration(inHours(-72))).toBe("3d");
  });

  it("returns null under a minute so callers can say 'just now' themselves", () => {
    expect(formatAgeDuration(inHours(-0.001))).toBeNull();
    expect(formatAgeDuration(NOW.toISOString())).toBeNull();
  });

  it("returns null when there is no usable timestamp", () => {
    expect(formatAgeDuration(null)).toBeNull();
    expect(formatAgeDuration(undefined)).toBeNull();
    expect(formatAgeDuration("not-a-date")).toBeNull();
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
