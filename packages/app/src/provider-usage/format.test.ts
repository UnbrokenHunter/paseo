import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatCompactUsage } from "./format";

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
