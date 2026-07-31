import { clampPct } from "./format";
import { deriveTone } from "./tone";
import type {
  ProviderUsage,
  ProviderUsageBalance,
  ProviderUsageTone,
  ProviderUsageView,
  ProviderUsageWindow,
} from "./types";

/**
 * One quantitative limit belonging to a provider account, normalized so callers
 * never re-derive percentages. A limit exists only when a percentage is known,
 * so `usedPct` and `remainingPct` are always numbers in 0..100.
 */
export interface ProviderUsageLimit {
  id: string;
  label: string;
  /** Which part of the provider payload this limit came from. */
  source: "window" | "balance";
  usedPct: number;
  remainingPct: number;
  resetsAt: string | null;
  /** Projected exhaustion time, when the provider forecasts one. */
  runsOutAt: string | null;
  tone: ProviderUsageTone;
}

interface ActiveAccountUsageData {
  usage: ProviderUsage;
  /** Rotation order: closest to exhaustion first. See `rotationOrder`. */
  limits: ProviderUsageLimit[];
  /** The limit the compact bar shows first — `limits[0]`. */
  primary: ProviderUsageLimit;
  /** ISO timestamp of the last successful fetch. */
  lastFetchedAt: string;
}

/**
 * What the active agent's provider account can show right now.
 *
 * `unavailable` means the provider exposes no quantitative usage (Copilot,
 * OpenCode, Pi, or an account the daemon could not read). `error` means a fetch
 * failed and there is nothing to fall back on. `stale` means the last known
 * numbers are still worth showing even though the newest refresh failed.
 * `unsupported` means the host cannot answer at all, which is not the user's
 * problem to retry — compact surfaces render nothing for it.
 */
export type ActiveAccountUsage =
  | { state: "loading" }
  | { state: "unsupported"; message: string }
  | ({ state: "available" } & ActiveAccountUsageData)
  | ({ state: "stale"; refreshError: string } & ActiveAccountUsageData)
  | { state: "unavailable"; usage: ProviderUsage | null; reason: string | null }
  | { state: "error"; message: string; usage: ProviderUsage | null };

/** Matches an agent's `provider` id to its row in a usage payload, case-insensitively. */
export function findProviderUsage(
  providers: ProviderUsage[],
  providerId: string | null | undefined,
): ProviderUsage | null {
  if (!providerId) return null;
  const target = providerId.toLowerCase();
  return providers.find((usage) => usage.providerId.toLowerCase() === target) ?? null;
}

interface UsageSplit {
  usedPct: number;
  remainingPct: number;
}

/**
 * `usedPct` wins when both sides are present so this agrees with the window bar,
 * which renders `usedPct` as the fill.
 */
function splitFromPct(
  usedPct: number | null | undefined,
  remainingPct: number | null | undefined,
): UsageSplit | null {
  if (typeof usedPct === "number" && Number.isFinite(usedPct)) {
    const used = clampPct(usedPct);
    return { usedPct: used, remainingPct: 100 - used };
  }
  if (typeof remainingPct === "number" && Number.isFinite(remainingPct)) {
    const remaining = clampPct(remainingPct);
    return { usedPct: 100 - remaining, remainingPct: remaining };
  }
  return null;
}

function limitFromWindow(window: ProviderUsageWindow): ProviderUsageLimit | null {
  const split = splitFromPct(window.usedPct, window.remainingPct);
  if (!split) return null;
  return {
    id: window.id,
    label: window.label,
    source: "window",
    usedPct: split.usedPct,
    remainingPct: split.remainingPct,
    resetsAt: window.resetsAt ?? null,
    runsOutAt: window.runsOutAt ?? null,
    tone: window.tone ?? deriveTone(split.usedPct),
  };
}

function balanceUsedPct(balance: ProviderUsageBalance): number | null {
  const limit = balance.limit;
  if (typeof limit !== "number" || !Number.isFinite(limit) || limit <= 0) return null;
  if (typeof balance.used === "number" && Number.isFinite(balance.used)) {
    return (balance.used / limit) * 100;
  }
  if (typeof balance.remaining === "number" && Number.isFinite(balance.remaining)) {
    return ((limit - balance.remaining) / limit) * 100;
  }
  return null;
}

function limitFromBalance(balance: ProviderUsageBalance): ProviderUsageLimit | null {
  const split = splitFromPct(balanceUsedPct(balance), null);
  if (!split) return null;
  return {
    id: balance.id,
    label: balance.label,
    source: "balance",
    usedPct: split.usedPct,
    remainingPct: split.remainingPct,
    resetsAt: balance.resetsAt ?? null,
    runsOutAt: null,
    tone: balance.tone ?? deriveTone(split.usedPct),
  };
}

/**
 * Every limit the provider reports a percentage for, in the order the provider
 * declared them. Balances only qualify when they carry a limit to measure against.
 */
export function toUsageLimits(usage: ProviderUsage): ProviderUsageLimit[] {
  const fromWindows = usage.windows.map(limitFromWindow);
  const fromBalances = (usage.balances ?? []).map(limitFromBalance);
  return [...fromWindows, ...fromBalances].filter(
    (limit): limit is ProviderUsageLimit => limit !== null,
  );
}

function timestampMs(iso: string | null): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Closeness to exhaustion: a projected `runsOutAt` outranks any limit without one,
 * soonest first; limits with no projection fall back to highest `usedPct`.
 */
function compareExhaustion(a: ProviderUsageLimit, b: ProviderUsageLimit): number {
  const aRunsOut = timestampMs(a.runsOutAt);
  const bRunsOut = timestampMs(b.runsOutAt);
  if (aRunsOut !== null && bRunsOut !== null) return aRunsOut - bRunsOut;
  if (aRunsOut !== null) return -1;
  if (bRunsOut !== null) return 1;
  return b.usedPct - a.usedPct;
}

/**
 * The order the compact bar rotates through: closest to exhaustion first, so
 * `rotationOrder(limits)[0]` is the limit that matters most right now. Ties keep
 * the provider's own order.
 */
export function rotationOrder(limits: ProviderUsageLimit[]): ProviderUsageLimit[] {
  return [...limits].sort(compareExhaustion);
}

interface SelectActiveAccountUsageInput {
  view: ProviderUsageView;
  /** The active agent's `provider` id. */
  providerId: string | null | undefined;
}

/** Classifies what the active agent's provider account can show, from a usage view. */
export function selectActiveAccountUsage({
  view,
  providerId,
}: SelectActiveAccountUsageInput): ActiveAccountUsage {
  if (view.kind === "loading") {
    return { state: "loading" };
  }
  if (view.kind === "unsupported") {
    return { state: "unsupported", message: view.message };
  }
  if (view.kind === "error") {
    return { state: "error", message: view.message, usage: null };
  }

  const usage = findProviderUsage(view.payload.providers, providerId);
  if (!usage) {
    return { state: "unavailable", usage: null, reason: null };
  }
  if (usage.status === "error") {
    return { state: "error", message: usage.error ?? "Usage lookup failed", usage };
  }

  const limits = rotationOrder(toUsageLimits(usage));
  const primary = limits[0];
  if (usage.status === "unavailable" || !primary) {
    return { state: "unavailable", usage, reason: usage.error ?? null };
  }

  const data: ActiveAccountUsageData = {
    usage,
    limits,
    primary,
    lastFetchedAt: view.lastFetchedAt,
  };
  if (view.refreshError) {
    return { state: "stale", refreshError: view.refreshError, ...data };
  }
  return { state: "available", ...data };
}
