import { formatTokenCount } from "@/components/context-window-meter.utils";
import type { ProviderUsageBalanceUnit } from "./types";

export function clampPct(value: number): number {
  return Math.max(0, Math.min(100, value));
}

export function formatPct(value: number): string {
  return `${Math.round(clampPct(value))}%`;
}

function relativeDuration(iso: string): string | null {
  const diffMs = new Date(iso).getTime() - Date.now();
  if (!Number.isFinite(diffMs)) return null;
  if (diffMs <= 0) return "now";
  const diffMinutes = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays > 0) return `${diffDays}d`;
  if (diffHours > 0) return `${diffHours}h`;
  return `${diffMinutes}m`;
}

export function formatResetLabel(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const rel = relativeDuration(iso);
  if (!rel) return null;
  return rel === "now" ? "resetting now" : `resets ${rel}`;
}

/** "resets in 3h" — the prose form used by the compact usage bar and the popover. */
export function formatResetInLabel(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const rel = relativeDuration(iso);
  if (!rel) return null;
  return rel === "now" ? "resetting now" : `resets in ${rel}`;
}

export interface UsageSummaryParts {
  remainingPct: number;
  resetsAt: string | null;
}

/**
 * The one-line usage summary: `78% remaining · resets in 3h`, or just
 * `78% remaining` when the limit has no known reset time.
 */
export function formatUsageSummary(parts: UsageSummaryParts): string {
  const remaining = `${formatPct(parts.remainingPct)} remaining`;
  const reset = formatResetInLabel(parts.resetsAt);
  return reset ? `${remaining} · ${reset}` : remaining;
}

export interface CompactUsageParts extends UsageSummaryParts {}

/**
 * Values needed by the compact bar's translated sentence:
 * `{{percent}}% remaining · resets in {{duration}}`.
 * `duration` is omitted when the limit has no known reset time.
 */
export function formatCompactUsage(parts: CompactUsageParts): {
  percent: number;
  duration: string | null;
} {
  const duration = parts.resetsAt ? relativeDuration(parts.resetsAt) : null;
  return {
    percent: Math.round(clampPct(parts.remainingPct)),
    duration: duration === "now" ? null : duration,
  };
}

export function formatAgo(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const diffMs = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diffMs)) return null;
  if (diffMs < 60_000) return "just now";
  const diffMinutes = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays > 0) return `${diffDays}d ago`;
  if (diffHours > 0) return `${diffHours}h ago`;
  return `${diffMinutes}m ago`;
}

export function formatAmount(value: number, unit: ProviderUsageBalanceUnit): string {
  switch (unit) {
    case "usd":
      return `$${value.toFixed(2)}`;
    case "tokens":
      return formatTokenCount(value);
    default:
      return value.toLocaleString();
  }
}
