import { Fragment, useMemo } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { settingsStyles } from "@/styles/settings";
import { BindingRow } from "./binding-row";
import type { AccessModelSnapshotPayload } from "./types";

interface AgentRuntimeGroup {
  runtimeId: string;
  runtimeLabel: string;
  bindingIds: string[];
}

function groupBindingsByRuntime(payload: AccessModelSnapshotPayload): AgentRuntimeGroup[] {
  const runtimeLabelById = new Map(
    payload.agentRuntimes.map((runtime) => [runtime.id, runtime.label]),
  );
  const groups = new Map<string, AgentRuntimeGroup>();

  for (const binding of payload.bindings) {
    const existing = groups.get(binding.agentRuntimeId);
    if (existing) {
      existing.bindingIds.push(binding.id);
      continue;
    }
    groups.set(binding.agentRuntimeId, {
      runtimeId: binding.agentRuntimeId,
      runtimeLabel: runtimeLabelById.get(binding.agentRuntimeId) ?? binding.agentRuntimeId,
      bindingIds: [binding.id],
    });
  }

  return [...groups.values()];
}

export function AgentRuntimesList({ payload }: { payload: AccessModelSnapshotPayload }) {
  const groups = useMemo(() => groupBindingsByRuntime(payload), [payload]);
  const bindingById = useMemo(
    () => new Map(payload.bindings.map((binding) => [binding.id, binding])),
    [payload.bindings],
  );
  const accountById = useMemo(
    () => new Map(payload.accounts.map((account) => [account.id, account])),
    [payload.accounts],
  );
  const accessServiceLabelById = useMemo(
    () => new Map(payload.accessServices.map((service) => [service.id, service.label])),
    [payload.accessServices],
  );

  return (
    <View style={styles.groups}>
      {groups.map((group) => (
        <View key={group.runtimeId} style={settingsStyles.card}>
          <Text style={styles.runtimeLabel}>{group.runtimeLabel}</Text>
          {group.bindingIds.map((bindingId, index) => {
            const binding = bindingById.get(bindingId);
            if (!binding) return null;
            return (
              <Fragment key={bindingId}>
                {index > 0 ? <View style={styles.divider} /> : null}
                <BindingRow
                  binding={binding}
                  account={accountById.get(binding.accountId)}
                  accessServiceLabel={
                    accessServiceLabelById.get(binding.accessServiceId) ?? binding.accessServiceId
                  }
                />
              </Fragment>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  groups: {
    gap: theme.spacing[3],
  },
  runtimeLabel: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: "600",
    paddingTop: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.border,
  },
}));
