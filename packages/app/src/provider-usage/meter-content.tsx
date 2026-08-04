import { useCallback, useEffect, useMemo, useState, type ComponentProps } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useAppSettings } from "@/hooks/use-settings";
import {
  selectActiveAccountUsage,
  type ActiveAccountUsage,
  type ProviderUsageLimit,
} from "./active-account";
import { getProviderBrandColors } from "./brand-colors";
import { formatCompactUsage } from "./format";
import { ProviderUsageTooltipSection } from "./tooltip-section";
import type { ProviderUsageView } from "./types";
import { UsageMarquee } from "./usage-marquee";
import { useProviderUsage } from "./use-provider-usage";
import { formatTokenCount } from "../components/context-window-meter.utils";

const ROTATION_INTERVAL_MS = 8_000;
const FADE_DURATION_MS = 250;

type AnimatedStyle = ComponentProps<typeof Animated.View>["style"];

function formatSessionCost(value: number): string | null {
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  if (value < 0.01) {
    return `$${value.toFixed(4)}`;
  }
  return `$${value.toFixed(2)}`;
}

/**
 * The compact bar's sentence. `null` with `skeleton` false means the bar has nothing
 * to say and the meter falls back to the bare ring — that is the `unsupported` case,
 * where the host cannot answer and a retry the user presses would change nothing.
 */
function formatBarText(
  accountUsage: ActiveAccountUsage,
  activeLimit: ProviderUsageLimit | undefined,
  t: ReturnType<typeof useTranslation>["t"],
): { label: string | null; skeleton: boolean } {
  switch (accountUsage.state) {
    case "loading":
      return { label: null, skeleton: true };
    case "unsupported":
      return { label: accountUsage.message, skeleton: false };
    case "unmetered":
      return { label: t("providerUsage.states.unmetered"), skeleton: false };
    case "unavailable":
      return { label: t("providerUsage.states.unavailable"), skeleton: false };
    case "error":
      return {
        label: `${t("providerUsage.states.failed")} · ${t("providerUsage.states.retry")}`,
        skeleton: false,
      };
    case "available":
    case "stale": {
      if (!activeLimit) {
        return { label: t("providerUsage.states.unavailable"), skeleton: false };
      }
      const { percent, duration } = formatCompactUsage({
        remainingPct: activeLimit.remainingPct,
        resetsAt: activeLimit.resetsAt,
      });
      return {
        label: duration
          ? t("providerUsage.compact.remainingWithReset", { percent, duration })
          : t("providerUsage.compact.remaining", { percent }),
        skeleton: false,
      };
    }
  }
}

export function useProviderUsageMeterContent({
  provider,
  serverId,
}: {
  provider: string | null | undefined;
  serverId: string | undefined;
}) {
  const { t } = useTranslation();
  const { settings } = useAppSettings();
  const [isTooltipOpen, setIsTooltipOpen] = useState(false);
  const [rotationIndex, setRotationIndex] = useState(0);
  const [displayedRotationIndex, setDisplayedRotationIndex] = useState(0);

  const { view, refresh } = useProviderUsage(serverId ?? null, { persistent: true });

  const accountUsage = useMemo(
    () => selectActiveAccountUsage({ view, providerId: provider }),
    [provider, view],
  );

  const limits = useMemo(
    () =>
      accountUsage.state === "available" || accountUsage.state === "stale"
        ? accountUsage.limits
        : [],
    [accountUsage],
  );

  const shouldRotate = settings.providerUsageRotation && limits.length > 1;
  const activeLimit = shouldRotate ? limits[displayedRotationIndex % limits.length] : limits[0];

  useEffect(() => {
    if (!shouldRotate) {
      setRotationIndex(0);
      return;
    }
    const id = setInterval(() => {
      setRotationIndex((index) => (index + 1) % limits.length);
    }, ROTATION_INTERVAL_MS);
    return () => clearInterval(id);
  }, [limits.length, shouldRotate]);

  // Keep the outgoing sentence mounted until its fade-out completes, then swap the
  // limit and fade the incoming sentence in. This avoids an abrupt text replacement.
  const textOpacity = useSharedValue(1);
  useEffect(() => {
    if (rotationIndex === displayedRotationIndex) return;

    textOpacity.value = withTiming(0, { duration: FADE_DURATION_MS });
    const id = setTimeout(() => {
      setDisplayedRotationIndex(rotationIndex);
      textOpacity.value = withTiming(1, { duration: FADE_DURATION_MS });
    }, FADE_DURATION_MS);
    return () => clearTimeout(id);
  }, [displayedRotationIndex, rotationIndex, textOpacity]);

  const fadeStyle = useAnimatedStyle(() => ({ opacity: textOpacity.value }));

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen && !isTooltipOpen) {
        void refresh().catch(() => {});
      }
      setIsTooltipOpen(nextOpen);
    },
    [isTooltipOpen, refresh],
  );

  // Pinning is the Tooltip's own business; the press only has to retry when the
  // numbers on screen are not current, since tooltip content is not interactive.
  const handlePress = useCallback(() => {
    if (accountUsage.state === "error" || accountUsage.state === "stale") {
      void refresh().catch(() => {});
    }
  }, [accountUsage.state, refresh]);

  const { label, skeleton } = formatBarText(accountUsage, activeLimit, t);

  return {
    barLabel: label,
    brandColors: getProviderBrandColors(provider),
    fadeStyle,
    handleOpenChange,
    handlePress,
    isBarSkeleton: skeleton,
    isTooltipOpen,
    view,
  };
}

/** The pill's sentence, or its loading placeholder. */
export function ProviderUsageMeterLabel({
  fadeStyle,
  label,
  skeleton,
}: {
  fadeStyle: AnimatedStyle;
  label: string | null;
  skeleton: boolean;
}) {
  if (skeleton || label === null) {
    return <View style={styles.skeletonLabel} />;
  }
  return (
    <UsageMarquee
      label={label}
      textStyle={styles.barText}
      fadeStyle={fadeStyle}
      testID="provider-usage-bar-label"
    />
  );
}

/**
 * The popover body: the context-window numbers the meter has always shown, with the
 * provider-usage card appended. Deliberately unchanged from the plain context tooltip
 * otherwise — the usage bar is a new surface, the popover behind it is not.
 */
export function ProviderUsageMeterTooltipContent({
  maxTokens,
  percentage,
  provider,
  totalCostUsd,
  usageView,
  usedTokens,
}: {
  maxTokens: number | null;
  percentage: number | null;
  provider: string | null | undefined;
  totalCostUsd: number | null | undefined;
  usageView: ProviderUsageView;
  usedTokens: number | null;
}) {
  const { t } = useTranslation();
  const hasContextWindow = percentage !== null && maxTokens !== null && usedTokens !== null;
  const sessionCost = typeof totalCostUsd === "number" ? formatSessionCost(totalCostUsd) : null;

  return (
    <View style={styles.tooltipContent}>
      {hasContextWindow ? (
        <>
          <Text style={styles.tooltipTitle}>{t("contextWindow.title")}</Text>
          <Text style={styles.tooltipText}>{t("contextWindow.used", { percentage })}</Text>
          <Text style={styles.tooltipDetail}>
            {t("contextWindow.tokens", {
              used: formatTokenCount(usedTokens),
              max: formatTokenCount(maxTokens),
            })}
          </Text>
        </>
      ) : null}
      {sessionCost ? (
        <Text style={styles.tooltipDetail}>
          {t("contextWindow.sessionCost", { cost: sessionCost })}
        </Text>
      ) : null}
      <ProviderUsageTooltipSection view={usageView} activeProviderId={provider} />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  barText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.medium,
  },
  skeletonLabel: {
    width: 80,
    height: theme.fontSize.xs,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surface3,
  },
  tooltipContent: {
    gap: theme.spacing[1.5],
    minWidth: 200,
  },
  tooltipTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  tooltipText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    lineHeight: theme.fontSize.sm * 1.4,
  },
  tooltipDetail: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    lineHeight: theme.fontSize.xs * 1.4,
  },
}));
