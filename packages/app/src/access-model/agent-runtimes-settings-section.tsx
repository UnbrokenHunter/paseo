import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { settingsStyles } from "@/styles/settings";
import { SettingsSection } from "@/screens/settings/settings-section";
import { AgentRuntimesList } from "./list";
import type { AccessModelSnapshotView } from "./types";

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

  return <AgentRuntimesList payload={view.payload} />;
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
}));
