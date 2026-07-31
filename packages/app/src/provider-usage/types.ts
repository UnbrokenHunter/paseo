import type {
  ProviderUsage,
  ProviderUsageBalance,
  ProviderUsageDetail,
  ProviderUsageListResponseMessage,
  ProviderUsageStatus,
  ProviderUsageTone,
  ProviderUsageWindow,
} from "@getpaseo/protocol/messages";

export type {
  ProviderUsage,
  ProviderUsageBalance,
  ProviderUsageDetail,
  ProviderUsageStatus,
  ProviderUsageTone,
  ProviderUsageWindow,
};

export type ProviderUsageBalanceUnit = ProviderUsageBalance["unit"];
export type ProviderUsageListPayload = ProviderUsageListResponseMessage["payload"];

/**
 * What the client currently knows about provider usage.
 *
 * `ready` carries the last payload that arrived successfully, even when the most
 * recent refresh failed — `refreshError` and `lastFetchedAt` are what let a surface
 * show a last-known value together with how old it is and why it stopped updating.
 * `error` means there is nothing to show at all.
 */
export type ProviderUsageView =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | {
      kind: "ready";
      payload: ProviderUsageListPayload;
      /** ISO timestamp of the last successful fetch of `payload`. */
      lastFetchedAt: string;
      isRefreshing: boolean;
      /** Message from the latest failed refresh; null while refreshes are succeeding. */
      refreshError: string | null;
    };
