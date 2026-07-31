import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Pressable,
  Text,
  View,
  type LayoutChangeEvent,
  type TextLayoutEventData,
} from "react-native";
import Svg, { Circle } from "react-native-svg";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAppSettings } from "@/hooks/use-settings";
import { ProviderUsageTooltipSection } from "@/provider-usage/tooltip-section";
import {
  selectActiveAccountUsage,
  type ActiveAccountUsage,
  type ProviderUsageLimit,
} from "@/provider-usage/active-account";
import { formatAgo, formatCompactUsage } from "@/provider-usage/format";
import { getProviderBrandColors } from "@/provider-usage/brand-colors";
import { useProviderUsage } from "@/provider-usage/use-provider-usage";
import { formatTokenCount } from "./context-window-meter.utils";

interface ContextWindowMeterProps {
  maxTokens: number | null;
  usedTokens: number | null;
  totalCostUsd?: number | null;
  showPercentage?: boolean;
  serverId?: string;
  /** The Paseo provider key, e.g. "claude", "gemini", "codex" */
  provider?: string | null;
  /** Reserve the meter footprint and show a loading ring while usage is pending. */
  pending?: boolean;
  /** Optional glyph envelope for icon-toolbar alignment. */
  glyphSize?: number;
}

const SVG_SIZE = 14;
const COMPACT_SVG_SIZE = 12;
const COMPACT_CENTER = COMPACT_SVG_SIZE / 2;
const COMPACT_RADIUS = 5;
const STROKE_WIDTH = 2;
const COMPACT_STROKE_WIDTH = 1.75;
const COMPACT_CIRCUMFERENCE = 2 * Math.PI * COMPACT_RADIUS;

const ROTATION_INTERVAL_MS = 8000;
const MARQUEE_SPEED_MS_PER_PX = 16;

function isValidMaxTokens(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function isValidUsedTokens(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function getUsagePercentage(maxTokens: number, usedTokens: number): number | null {
  if (!isValidMaxTokens(maxTokens) || !isValidUsedTokens(usedTokens)) {
    return null;
  }
  return (usedTokens / maxTokens) * 100;
}

function clampPercentage(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function formatSessionCost(value: number): string | null {
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  if (value < 0.01) {
    return `$${value.toFixed(4)}`;
  }
  return `$${value.toFixed(2)}`;
}

function getMeterColors(
  percentage: number,
  theme: ReturnType<typeof useUnistyles>["theme"],
): { progress: string; track: string } {
  const track = theme.colors.surface3;
  if (percentage > 90) {
    return { progress: theme.colors.destructive, track };
  }
  if (percentage >= 70) {
    return { progress: theme.colors.palette.amber[500], track };
  }
  return { progress: theme.colors.foregroundMuted, track };
}

function getMeterGeometry(showPercentage: boolean, glyphSize?: number) {
  if (showPercentage) {
    return {
      svgSize: COMPACT_SVG_SIZE,
      center: COMPACT_CENTER,
      radius: COMPACT_RADIUS,
      strokeWidth: COMPACT_STROKE_WIDTH,
      circumference: COMPACT_CIRCUMFERENCE,
    };
  }
  const resolvedSize = glyphSize ?? SVG_SIZE;
  const resolvedStrokeWidth = glyphSize ? 2 : STROKE_WIDTH;
  return {
    svgSize: resolvedSize,
    center: resolvedSize / 2,
    radius: (resolvedSize - resolvedStrokeWidth) / 2,
    strokeWidth: resolvedStrokeWidth,
    circumference: Math.PI * (resolvedSize - resolvedStrokeWidth),
  };
}

function formatBarText(
  accountUsage: ActiveAccountUsage,
  activeLimit: ProviderUsageLimit | undefined,
  t: ReturnType<typeof useTranslation>["t"],
): { node: React.ReactNode; skeleton?: boolean } {
  switch (accountUsage.state) {
    case "loading":
      return { node: null, skeleton: true };
    case "unavailable":
      return { node: t("providerUsage.states.unavailable") };
    case "error":
      return {
        node: `${t("providerUsage.states.failed")} · ${t("providerUsage.states.retry")}`,
      };
    case "available":
    case "stale":
      if (!activeLimit) {
        return { node: t("providerUsage.states.unavailable") };
      }
      const { percent, duration } = formatCompactUsage({
        remainingPct: activeLimit.remainingPct,
        resetsAt: activeLimit.resetsAt,
      });
      return {
        node: duration
          ? t("providerUsage.compact.remainingWithReset", { percent, duration })
          : t("providerUsage.compact.remaining", { percent }),
      };
    default:
      return { node: t("providerUsage.states.unavailable") };
  }
}

export function ContextWindowMeter({
  maxTokens,
  usedTokens,
  totalCostUsd,
  showPercentage = false,
  serverId,
  provider,
  pending = false,
  glyphSize,
}: ContextWindowMeterProps) {
  const { theme } = useUnistyles();
  const { t } = useTranslation();
  const { settings } = useAppSettings();
  const [isTooltipOpen, setIsTooltipOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [rotationIndex, setRotationIndex] = useState(0);
  const [barWidth, setBarWidth] = useState(0);
  const [textWidth, setTextWidth] = useState(0);

  const { view: providerUsageView, refresh: refreshProviderUsage } = useProviderUsage(
    serverId ?? null,
    { persistent: true },
  );

  const accountUsage = useMemo(
    () => selectActiveAccountUsage({ view: providerUsageView, providerId: provider }),
    [providerUsageView, provider],
  );

  const limits = useMemo(
    () =>
      accountUsage.state === "available" || accountUsage.state === "stale"
        ? accountUsage.limits
        : [],
    [accountUsage],
  );

  const shouldRotate = settings.providerUsageRotation && limits.length > 1;
  const activeLimit = shouldRotate ? limits[rotationIndex % limits.length] : limits[0];

  useEffect(() => {
    if (!shouldRotate) {
      setRotationIndex(0);
      return;
    }
    const id = setInterval(() => {
      setRotationIndex((index) => (index + 1) % limits.length);
    }, ROTATION_INTERVAL_MS);
    return () => clearInterval(id);
  }, [shouldRotate, limits.length]);

  const textOpacity = useSharedValue(1);
  useEffect(() => {
    textOpacity.value = withTiming(1, { duration: 250 });
  }, [rotationIndex, textOpacity]);

  const fadeStyle = useAnimatedStyle(() => ({ opacity: textOpacity.value }));

  const enableMarquee = textWidth > barWidth && barWidth > 0;
  const marqueeTranslate = useSharedValue(0);
  useEffect(() => {
    if (!enableMarquee || textWidth <= 0 || barWidth <= 0) {
      marqueeTranslate.value = 0;
      return;
    }
    const distance = textWidth + barWidth;
    const duration = distance * MARQUEE_SPEED_MS_PER_PX;
    marqueeTranslate.value = barWidth;
    marqueeTranslate.value = withRepeat(
      withTiming(-textWidth, { duration, easing: Easing.linear }),
      -1,
      false,
    );
  }, [enableMarquee, textWidth, barWidth, marqueeTranslate]);

  const marqueeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: marqueeTranslate.value }],
  }));

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      setIsTooltipOpen((prev) => {
        if (nextOpen && !prev) {
          void refreshProviderUsage().catch(() => {});
        }
        return nextOpen;
      });
      if (!nextOpen) {
        setPinned(false);
      }
    },
    [refreshProviderUsage],
  );

  const handlePress = useCallback(() => {
    if (accountUsage.state === "error") {
      void refreshProviderUsage().catch(() => {});
    }
    setPinned((prev) => {
      const next = !prev;
      setIsTooltipOpen(next);
      return next;
    });
  }, [accountUsage.state, refreshProviderUsage]);

  const handleTextLayout = useCallback(
    (event: { nativeEvent: { lines: TextLayoutEventData["lines"] } }) => {
      const firstLine = event.nativeEvent.lines[0];
      if (firstLine) {
        setTextWidth(firstLine.width);
      }
    },
    [],
  );

  const handleBarLayout = useCallback((event: LayoutChangeEvent) => {
    setBarWidth(event.nativeEvent.layout.width);
  }, []);

  const percentage =
    maxTokens !== null && usedTokens !== null ? getUsagePercentage(maxTokens, usedTokens) : null;

  const geometry = getMeterGeometry(showPercentage, glyphSize);

  if (percentage === null || maxTokens === null || usedTokens === null) {
    if (!pending) {
      return null;
    }
    return (
      <View style={styles.containerIdle}>
        <Svg
          width={geometry.svgSize}
          height={geometry.svgSize}
          viewBox={`0 0 ${geometry.svgSize} ${geometry.svgSize}`}
          style={styles.svg}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Circle
            cx={geometry.center}
            cy={geometry.center}
            r={geometry.radius}
            fill="none"
            stroke={theme.colors.surface3}
            strokeWidth={geometry.strokeWidth}
          />
        </Svg>
      </View>
    );
  }

  const clampedPercentage = clampPercentage(percentage);
  const roundedPercentage = Math.round(percentage);
  const { svgSize, center, radius, strokeWidth, circumference } = geometry;
  const dashOffset = circumference - (clampedPercentage / 100) * circumference;
  const colors = getMeterColors(clampedPercentage, theme);
  const formattedSessionCost =
    typeof totalCostUsd === "number" ? formatSessionCost(totalCostUsd) : null;

  const brandColors = getProviderBrandColors(provider);
  const barBackground = brandColors.background;
  const barForeground = brandColors.foreground;
  const { node: barTextNode, skeleton: isBarSkeleton } = formatBarText(
    accountUsage,
    activeLimit,
    t,
  );

  return (
    <Tooltip
      open={isTooltipOpen}
      onOpenChange={handleOpenChange}
      delayDuration={0}
      enabledOnDesktop
      enabledOnMobile
      openOnPress
      pinned={pinned}
    >
      <TooltipTrigger asChild triggerRefProp="ref">
        <Pressable
          style={[styles.container, { backgroundColor: barBackground }]}
          testID="context-window-meter"
          accessibilityRole="image"
          accessibilityLabel={t("contextWindow.accessibility", {
            percentage: roundedPercentage,
          })}
          onPress={handlePress}
        >
          <View style={styles.barTextContainer} onLayout={handleBarLayout}>
            {isBarSkeleton ? (
              <View style={[styles.skeletonLabel, { backgroundColor: `${barForeground}40` }]} />
            ) : (
              <Animated.View
                style={[styles.barTextWrapper, fadeStyle, enableMarquee ? marqueeStyle : undefined]}
              >
                <Text
                  style={[styles.barText, { color: barForeground }]}
                  numberOfLines={1}
                  onTextLayout={handleTextLayout}
                >
                  {barTextNode}
                </Text>
              </Animated.View>
            )}
          </View>
          {showPercentage ? (
            <Text
              style={[styles.percentageLabel, { color: barForeground }]}
            >{`${roundedPercentage}%`}</Text>
          ) : null}
          <Svg
            width={svgSize}
            height={svgSize}
            viewBox={`0 0 ${svgSize} ${svgSize}`}
            style={styles.svg}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <Circle
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke={colors.track}
              strokeWidth={strokeWidth}
            />
            <Circle
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke={colors.progress}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
            />
          </Svg>
        </Pressable>
      </TooltipTrigger>
      <TooltipContent side="top" align="center" offset={8}>
        <View style={styles.tooltipContent}>
          <Text style={styles.tooltipTitle}>{t("contextWindow.title")}</Text>
          <Text style={styles.tooltipText}>
            {t("contextWindow.used", { percentage: roundedPercentage })}
          </Text>
          <Text style={styles.tooltipDetail}>
            {t("contextWindow.tokens", {
              used: formatTokenCount(usedTokens),
              max: formatTokenCount(maxTokens),
            })}
          </Text>
          {formattedSessionCost ? (
            <Text style={styles.tooltipDetail}>
              {t("contextWindow.sessionCost", { cost: formattedSessionCost })}
            </Text>
          ) : null}
          {accountUsage.state === "error" ? (
            <View style={styles.errorRow}>
              <Text style={styles.errorText}>{accountUsage.message}</Text>
            </View>
          ) : null}
          {accountUsage.state === "stale" ? (
            <View style={styles.errorRow}>
              <Text style={styles.errorText}>{accountUsage.refreshError}</Text>
              <Text style={styles.tooltipDetail}>
                {t("providerUsage.states.staleAge", {
                  age: formatAgo(accountUsage.lastFetchedAt),
                })}
              </Text>
            </View>
          ) : null}
          <ProviderUsageTooltipSection view={providerUsageView} activeProviderId={provider} />
        </View>
      </TooltipContent>
    </Tooltip>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    height: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[1.5],
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.full,
    maxWidth: 180,
  },
  containerIdle: {
    width: 28,
    height: 28,
    borderRadius: theme.borderRadius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  barTextContainer: {
    flexShrink: 1,
    overflow: "hidden",
  },
  barTextWrapper: {
    flexDirection: "row",
  },
  barText: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.medium,
  },
  skeletonLabel: {
    width: 80,
    height: theme.fontSize.xs,
    borderRadius: theme.borderRadius.full,
  },
  svg: {
    transform: [{ rotate: "-90deg" }],
  },
  percentageLabel: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.normal,
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
  errorRow: {
    gap: theme.spacing[1],
  },
  errorText: {
    color: theme.colors.palette.red[300],
    fontSize: theme.fontSize.xs,
    lineHeight: theme.fontSize.xs * 1.4,
  },
}));
