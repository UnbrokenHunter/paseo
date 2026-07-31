import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { useHostRuntimeClient, useHostRuntimeIsConnected } from "@/runtime/host-runtime";
import { useSessionStore } from "@/stores/session-store";
import type { ProviderUsageListPayload, ProviderUsageView } from "./types";

export const PROVIDER_USAGE_STALE_TIME_MS = 5 * 60 * 1000;

type ProviderUsageClient = Pick<DaemonClient, "listProviderUsage">;

export function providerUsageQueryKey(serverId: string | null | undefined) {
  return ["providerUsage", serverId ?? ""] as const;
}

async function fetchProviderUsage(client: ProviderUsageClient): Promise<ProviderUsageListPayload> {
  return client.listProviderUsage();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface UseProviderUsageOptions {
  /**
   * Keep the query enabled for the hook's whole lifetime and ignore `enabled`.
   * Surfaces that render a usage value continuously (the composer usage bar, the
   * host usage settings page) use this because they cannot wait for a hover to
   * start fetching. Cadence is unchanged: `PROVIDER_USAGE_STALE_TIME_MS` still
   * decides when an enabled query actually hits the daemon.
   */
  persistent?: boolean;
  /** Gate for on-demand surfaces. Ignored when `persistent` is set. */
  enabled?: boolean;
}

export function useProviderUsage(
  serverId: string | null | undefined,
  options: UseProviderUsageOptions = {},
): {
  view: ProviderUsageView;
  refresh: () => Promise<void>;
  canFetch: boolean;
} {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const client = useHostRuntimeClient(serverId ?? "");
  const isConnected = useHostRuntimeIsConnected(serverId ?? "");
  const supportsProviderUsage = useSessionStore(
    (state) => state.sessions[serverId ?? ""]?.serverInfo?.features?.providerUsageList === true,
  );
  const queryKey = useMemo(() => providerUsageQueryKey(serverId), [serverId]);
  const canFetch = Boolean(serverId && client && isConnected && supportsProviderUsage);
  const isRequested = options.persistent === true || (options.enabled ?? true);
  const enabled = Boolean(isRequested && canFetch);

  const queryFn = useCallback(async () => {
    if (!client) {
      throw new Error(t("providerUsage.clientUnavailable"));
    }
    return fetchProviderUsage(client);
  }, [client, t]);

  const query = useQuery({
    queryKey,
    queryFn,
    enabled,
    staleTime: PROVIDER_USAGE_STALE_TIME_MS,
    refetchOnMount: true,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });

  const refresh = useCallback(async () => {
    if (!canFetch) return;
    await queryClient.invalidateQueries({ queryKey });
    await queryClient.fetchQuery({
      queryKey,
      queryFn,
      staleTime: PROVIDER_USAGE_STALE_TIME_MS,
    });
  }, [canFetch, queryClient, queryFn, queryKey]);

  const view = useMemo<ProviderUsageView>(() => {
    if (!serverId || !client || !isConnected) {
      return { kind: "error", message: t("providerUsage.hostUnavailable") };
    }
    if (!supportsProviderUsage) {
      return { kind: "error", message: t("providerUsage.hostUpgradeRequired") };
    }
    const failure = query.isError ? errorMessage(query.error) : null;
    if (query.data) {
      return {
        kind: "ready",
        payload: query.data,
        lastFetchedAt: new Date(query.dataUpdatedAt).toISOString(),
        isRefreshing: query.isFetching,
        refreshError: failure,
      };
    }
    if (failure) {
      return { kind: "error", message: failure };
    }
    return { kind: "loading" };
  }, [
    client,
    isConnected,
    query.data,
    query.dataUpdatedAt,
    query.error,
    query.isError,
    query.isFetching,
    serverId,
    supportsProviderUsage,
    t,
  ]);

  return { view, refresh, canFetch };
}
