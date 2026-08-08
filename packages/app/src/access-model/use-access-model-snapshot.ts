import { useCallback, useMemo } from "react";
import { useFetchQuery } from "@/data/query";
import { useHostRuntimeClient, useHostRuntimeIsConnected } from "@/runtime/host-runtime";
import { useSessionStore } from "@/stores/session-store";
import { accessModelCopy } from "./copy";
import type { AccessModelSnapshotView } from "./types";

export const ACCESS_MODEL_SNAPSHOT_STALE_TIME_MS = 5 * 60 * 1000;

export function accessModelSnapshotQueryKey(serverId: string | null | undefined) {
  return ["accessModelSnapshot", serverId ?? ""] as const;
}

interface UseAccessModelSnapshotOptions {
  enabled?: boolean;
}

export function useAccessModelSnapshot(
  serverId: string | null | undefined,
  options: UseAccessModelSnapshotOptions = {},
): {
  view: AccessModelSnapshotView;
  refresh: () => Promise<void>;
  canFetch: boolean;
} {
  const client = useHostRuntimeClient(serverId ?? "");
  const isConnected = useHostRuntimeIsConnected(serverId ?? "");
  const supportsAccessModelSnapshot = useSessionStore(
    (state) => state.sessions[serverId ?? ""]?.serverInfo?.features?.accessModelSnapshot === true,
  );
  const canFetch = Boolean(serverId && client && isConnected && supportsAccessModelSnapshot);
  const enabled = Boolean((options.enabled ?? true) && canFetch);

  const query = useFetchQuery({
    queryKey: accessModelSnapshotQueryKey(serverId),
    dataShape: "value",
    staleTimeMs: ACCESS_MODEL_SNAPSHOT_STALE_TIME_MS,
    enabled,
    queryFn: async () => {
      if (!client) {
        throw new Error(accessModelCopy.clientUnavailable);
      }
      return client.getAccessModelSnapshot();
    },
  });

  const refresh = useCallback(async () => {
    if (!canFetch) return;
    await query.refetch();
  }, [canFetch, query]);

  const view = useMemo<AccessModelSnapshotView>(() => {
    if (!serverId || !client || !isConnected) {
      return { kind: "error", message: accessModelCopy.hostUnavailable };
    }
    if (!supportsAccessModelSnapshot) {
      return { kind: "error", message: accessModelCopy.hostUpgradeRequired };
    }
    if (query.data) {
      return {
        kind: "ready",
        payload: query.data,
        isRefreshing: query.isFetching,
      };
    }
    if (query.isError) {
      return {
        kind: "error",
        message: query.error instanceof Error ? query.error.message : String(query.error),
      };
    }
    return { kind: "loading" };
  }, [
    client,
    isConnected,
    query.data,
    query.error,
    query.isError,
    query.isFetching,
    serverId,
    supportsAccessModelSnapshot,
  ]);

  return { view, refresh, canFetch };
}
