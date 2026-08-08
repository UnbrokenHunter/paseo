import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { getProviderIcon } from "@/components/provider-icons";
import { StatusBadge } from "@/components/ui/status-badge";
import type { Theme } from "@/styles/theme";
import type { Account, Binding } from "./types";

interface BindingIconProps {
  iconKey: string;
  size: number;
  color?: string;
}

function BindingIcon({ iconKey, size, color = "" }: BindingIconProps) {
  const Icon = getProviderIcon(iconKey);
  return <Icon size={size} color={color} />;
}

const ThemedBindingIcon = withUnistyles(BindingIcon);

const mutedIconColor = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

function identityConfidenceLabel(
  t: ReturnType<typeof useTranslation>["t"],
  confidence: Account["identityConfidence"],
): string {
  if (confidence === "verified") return t("settings.agentRuntimes.identityConfidence.verified");
  if (confidence === "user-linked")
    return t("settings.agentRuntimes.identityConfidence.userLinked");
  return t("settings.agentRuntimes.identityConfidence.unknown");
}

export function BindingRow({
  binding,
  account,
  accessServiceLabel,
}: {
  binding: Binding;
  account: Account | undefined;
  accessServiceLabel: string;
}) {
  const { t } = useTranslation();
  const statusLabel = binding.enabled
    ? t("settings.agentRuntimes.statuses.enabled")
    : t("settings.agentRuntimes.statuses.disabled");

  return (
    <View style={styles.row}>
      <ThemedBindingIcon iconKey={binding.id} size={14} uniProps={mutedIconColor} />
      <View style={styles.labels}>
        <Text style={styles.name} numberOfLines={1}>
          {binding.label}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {accessServiceLabel}
          {account ? ` · ${identityConfidenceLabel(t, account.identityConfidence)}` : ""}
        </Text>
      </View>
      <View style={styles.spacer} />
      <StatusBadge label={statusLabel} variant={binding.enabled ? "success" : "muted"} />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
  },
  labels: {
    flexShrink: 1,
    gap: theme.spacing[1],
  },
  name: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  meta: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  spacer: {
    flex: 1,
  },
}));
