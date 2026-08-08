import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { settingsStyles } from "@/styles/settings";
import { SettingsSection } from "@/screens/settings/settings-section";
import {
  buildFacetedModelSelectorHeader,
  FacetedModelSelectorBody,
} from "@/components/faceted-model-selector";
import { useFacetedModelSelector } from "./faceted-model-selector-state";
import { AgentRuntimesList } from "./list";
import type { AccessModelSnapshotPayload, AccessModelSnapshotView } from "./types";

export function AgentRuntimesSettingsSection({
  view,
  onRefresh,
}: {
  view: AccessModelSnapshotView;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();

  return (
    <SettingsSection title={t("settings.agentRuntimes.title")} testID="agent-runtimes-card">
      <AgentRuntimesBody view={view} onRefresh={onRefresh} />
    </SettingsSection>
  );
}

function AgentRuntimesBody({
  view,
  onRefresh,
}: {
  view: AccessModelSnapshotView;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();

  if (view.kind === "loading") {
    return (
      <View style={[settingsStyles.card, styles.emptyCard]}>
        <Text style={styles.emptyText}>{t("settings.agentRuntimes.loading")}</Text>
      </View>
    );
  }

  if (view.kind === "error") {
    return (
      <Alert variant="error" description={view.message}>
        <Button variant="outline" size="sm" onPress={onRefresh}>
          {t("settings.agentRuntimes.retry")}
        </Button>
      </Alert>
    );
  }

  if (view.payload.bindings.length === 0) {
    return (
      <View style={[settingsStyles.card, styles.emptyCard]}>
        <Text style={styles.emptyText}>{t("settings.agentRuntimes.empty")}</Text>
      </View>
    );
  }

  return (
    <View style={styles.stack}>
      <AgentRuntimesList payload={view.payload} />
      <ModelRoutingBlock payload={view.payload} />
    </View>
  );
}

/**
 * The four-facet selector over this host's real capability catalog. Read-only
 * for now: it resolves and shows the binding + runtime model id an agent
 * would launch with, without changing what any existing flow launches.
 */
function ModelRoutingBlock({ payload }: { payload: AccessModelSnapshotPayload }) {
  const { t } = useTranslation();
  const state = useFacetedModelSelector({ snapshot: payload });
  const header = buildFacetedModelSelectorHeader(state);

  return (
    <View style={styles.routingBlock} testID="model-routing-card">
      <Text style={styles.routingTitle}>{t("settings.agentRuntimes.modelRouting.title")}</Text>
      <Text style={styles.routingDescription}>
        {t("settings.agentRuntimes.modelRouting.description")}
      </Text>

      {payload.routes.length === 0 ? (
        <Text style={styles.routingHint} testID="model-routing-empty">
          {t("settings.agentRuntimes.modelRouting.noRoutes")}
        </Text>
      ) : (
        <>
          <Text style={styles.routingSelection} testID="model-routing-selection">
            {header.title}
          </Text>
          {header.subtitle}
          <FacetedModelSelectorBody state={state} />
          <Text style={styles.routingHint} testID="model-routing-resolved">
            {state.launchable
              ? t("settings.agentRuntimes.modelRouting.resolved", {
                  binding: state.resolvedBindingId,
                  model: state.resolvedRuntimeModelId,
                })
              : t("settings.agentRuntimes.modelRouting.incomplete")}
          </Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  emptyCard: {
    padding: theme.spacing[4],
    alignItems: "center",
  },
  emptyText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  stack: {
    gap: theme.spacing[4],
  },
  routingBlock: {
    gap: theme.spacing[2],
    paddingTop: theme.spacing[2],
  },
  routingTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  routingDescription: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    lineHeight: theme.fontSize.xs * 1.4,
  },
  routingSelection: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    paddingTop: theme.spacing[1],
  },
  routingHint: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
}));
