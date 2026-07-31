import { RefreshCw } from "lucide-react-native";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { settingsStyles } from "@/styles/settings";
import { SettingsSection } from "@/screens/settings/settings-section";
import { ProviderUsageList } from "./list";
import type { ProviderUsageView } from "./types";

export function ProviderUsageSettingsSection({
  view,
  onRefresh,
}: {
  view: ProviderUsageView;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  const busy = view.kind === "loading" || (view.kind === "ready" && view.isRefreshing);

  const refreshButton = useMemo(
    () => (
      <Button
        variant="ghost"
        size="sm"
        leftIcon={RefreshCw}
        loading={busy}
        onPress={onRefresh}
        accessibilityLabel={t("providerUsage.refresh")}
      >
        {busy ? t("providerUsage.refreshing") : t("providerUsage.refresh")}
      </Button>
    ),
    [busy, onRefresh, t],
  );

  return (
    <SettingsSection
      title={t("providerUsage.title")}
      testID="provider-usage-card"
      trailing={refreshButton}
    >
      <ProviderUsageBody view={view} onRefresh={onRefresh} />
    </SettingsSection>
  );
}

function ProviderUsageBody({
  view,
  onRefresh,
}: {
  view: ProviderUsageView;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();

  if (view.kind === "loading") {
    return (
      <View style={[settingsStyles.card, styles.emptyCard]}>
        <Text style={styles.emptyText}>{t("providerUsage.states.loading")}</Text>
      </View>
    );
  }

  // A host that cannot answer at all is not something retrying fixes, so it gets a
  // plain explanation rather than an error with a dead retry button.
  if (view.kind === "unsupported") {
    return (
      <View style={[settingsStyles.card, styles.emptyCard]}>
        <Text style={styles.emptyText}>{view.message}</Text>
      </View>
    );
  }

  if (view.kind === "error") {
    return (
      <Alert variant="error" title={t("providerUsage.errorTitle")} description={view.message}>
        <Button variant="outline" size="sm" onPress={onRefresh}>
          {t("providerUsage.retry")}
        </Button>
      </Alert>
    );
  }

  if (view.payload.providers.length === 0) {
    return (
      <View style={[settingsStyles.card, styles.emptyCard]}>
        <Text style={styles.emptyText}>{t("providerUsage.empty")}</Text>
      </View>
    );
  }

  // A failed refresh keeps the last known numbers on screen, with the failure and a
  // retry above them so the stale values are not mistaken for current ones.
  return (
    <>
      {view.refreshError ? (
        <Alert
          variant="error"
          title={t("providerUsage.refreshFailedTitle")}
          description={view.refreshError}
        >
          <Button variant="outline" size="sm" onPress={onRefresh}>
            {t("providerUsage.retry")}
          </Button>
        </Alert>
      ) : null}
      <ProviderUsageList providers={view.payload.providers} />
    </>
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
}));
