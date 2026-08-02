import { useCallback, useEffect, useMemo, useState, type ComponentProps } from "react";
import { Pressable, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAppSettings } from "@/hooks/use-settings";
import { ProviderUsageTooltipSection } from "@/provider-usage/tooltip-section";
import {
  selectActiveAccountUsage,
  type ActiveAccountUsage,
  type ProviderUsageLimit,
} from "@/provider-usage/active-account";
import { formatCompactUsage } from "@/provider-usage/format";
import { getProviderBrandColors } from "@/provider-usage/brand-colors";
import type { ProviderUsageView } from "@/provider-usage/types";
import { UsageMarquee } from "@/provider-usage/usage-marquee";
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
const FADE_DURATION_MS = 250;

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
      ringOnlyStyle: styles.containerWithLabel,
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
    ringOnlyStyle: styles.containerIdle,
  };
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
      return { label: null, skeleton: false };
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

/** Screen readers get the context-window ring and the usage sentence as one label. */
function meterAccessibilityLabel(
  percentage: number | null,
  barLabel: string | null,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  const context = percentage === null ? null : t("contextWindow.accessibility", { percentage });
  return [context, barLabel].filter((part): part is string => part !== null).join(". ");
}

type MeterGeometry = ReturnType<typeof getMeterGeometry>;

/**
 * Reserves the meter's footprint with a track-only ring while a session is active but
 * has reported no tokens yet, so the real ring appears without shifting its siblings.
 */
function IdleMeter({
  geometry,
  showPercentage,
}: {
  geometry: MeterGeometry;
  showPercentage: boolean;
}) {
  const { theme } = useUnistyles();
  return (
    <View style={geometry.ringOnlyStyle}>
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
      {showPercentage ? <View style={styles.percentageSkeleton} /> : null}
    </View>
  );
}

/** The context-window ring: a track with the used fraction drawn over it. */
function MeterRing({
  geometry,
  percentage,
}: {
  geometry: MeterGeometry;
  percentage: number | null;
}) {
  const { theme } = useUnistyles();
  const { svgSize, center, radius, strokeWidth, circumference } = geometry;
  const clamped = percentage === null ? null : clampPercentage(percentage);
  const colors = getMeterColors(clamped ?? 0, theme);

  return (
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
      {clamped === null ? null : (
        <Circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={colors.progress}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - (clamped / 100) * circumference}
        />
      )}
    </Svg>
  );
}

type AnimatedStyle = ComponentProps<typeof Animated.View>["style"];

/** The pill's sentence, or its loading placeholder. */
function UsageBarLabel({
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
function ContextWindowTooltipBody({
  maxTokens,
  percentage,
  provider,
  sessionCost,
  usageView,
  usedTokens,
}: {
  maxTokens: number | null;
  percentage: number | null;
  provider: string | null | undefined;
  sessionCost: string | null;
  usageView: ProviderUsageView;
  usedTokens: number | null;
}) {
  const { t } = useTranslation();
  const hasContextWindow = percentage !== null && maxTokens !== null && usedTokens !== null;

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
  const { t } = useTranslation();
  const { settings } = useAppSettings();
  const [isTooltipOpen, setIsTooltipOpen] = useState(false);
  const [rotationIndex, setRotationIndex] = useState(0);

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

  // Fade the outgoing sentence out and the incoming one back in. Skipped on the very
  // first limit so the bar does not blink into view on mount.
  const textOpacity = useSharedValue(1);
  useEffect(() => {
    if (rotationIndex === 0) return;
    textOpacity.value = 0;
    textOpacity.value = withTiming(1, { duration: FADE_DURATION_MS });
  }, [rotationIndex, textOpacity]);

  const fadeStyle = useAnimatedStyle(() => ({ opacity: textOpacity.value }));

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen && !isTooltipOpen) {
        void refreshProviderUsage().catch(() => {});
      }
      setIsTooltipOpen(nextOpen);
    },
    [isTooltipOpen, refreshProviderUsage],
  );

  // Pinning is the Tooltip's own business; the press only has to retry when the
  // numbers on screen are not current, since tooltip content is not interactive.
  const handlePress = useCallback(() => {
    if (accountUsage.state === "error" || accountUsage.state === "stale") {
      void refreshProviderUsage().catch(() => {});
    }
  }, [accountUsage.state, refreshProviderUsage]);

  const percentage =
    maxTokens !== null && usedTokens !== null ? getUsagePercentage(maxTokens, usedTokens) : null;

  const geometry = getMeterGeometry(showPercentage, glyphSize);

  const { label: barLabel, skeleton: isBarSkeleton } = formatBarText(accountUsage, activeLimit, t);
  // Nothing to say and nothing pending: fall back to the bare ring the meter has
  // always been, rather than a tinted pill with no content.
  const showBar = barLabel !== null || isBarSkeleton;

  // The bar rides on the context-window meter and its popover leads with the context
  // numbers, so it waits for them. Showing the pill earlier would open a popover
  // missing its own first half.
  if (percentage === null && !showBar) {
    return pending ? <IdleMeter geometry={geometry} showPercentage={showPercentage} /> : null;
  }

  const roundedPercentage = percentage === null ? null : Math.round(percentage);
  const formattedSessionCost =
    typeof totalCostUsd === "number" ? formatSessionCost(totalCostUsd) : null;

  const brandColors = getProviderBrandColors(provider);
  const accessibilityLabel = meterAccessibilityLabel(roundedPercentage, barLabel, t);

  return (
    <Tooltip
      open={isTooltipOpen}
      onOpenChange={handleOpenChange}
      delayDuration={0}
      enabledOnDesktop
      enabledOnMobile
      pinnable
    >
      <TooltipTrigger asChild triggerRefProp="ref">
        <Pressable
          style={
            showBar
              ? [
                  styles.container,
                  { backgroundColor: brandColors.tint, borderColor: brandColors.border },
                ]
              : geometry.ringOnlyStyle
          }
          testID="context-window-meter"
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          onPress={handlePress}
        >
          {showBar ? (
            <>
              <View style={[styles.brandDot, { backgroundColor: brandColors.accent }]} />
              <UsageBarLabel fadeStyle={fadeStyle} label={barLabel} skeleton={isBarSkeleton} />
            </>
          ) : null}
          {showPercentage && roundedPercentage !== null ? (
            <Text style={styles.percentageLabel}>{`${roundedPercentage}%`}</Text>
          ) : null}
          <MeterRing geometry={geometry} percentage={percentage} />
        </Pressable>
      </TooltipTrigger>
      <TooltipContent side="top" align="center" offset={8}>
        <ContextWindowTooltipBody
          maxTokens={maxTokens}
          percentage={roundedPercentage}
          provider={provider}
          sessionCost={formattedSessionCost}
          usageView={providerUsageView}
          usedTokens={usedTokens}
        />
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
    paddingLeft: theme.spacing[2],
    paddingRight: theme.spacing[1.5],
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    // The pill shares the composer's right-hand controls with the voice and send
    // buttons, so it is capped harder where there is less room to share.
    maxWidth: {
      xs: 132,
      sm: 180,
    },
  },
  containerIdle: {
    width: 28,
    height: 28,
    borderRadius: theme.borderRadius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  containerWithLabel: {
    height: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[1],
    borderRadius: theme.borderRadius.full,
  },
  // Carries the provider's brand into the pill without letting it own the whole fill.
  brandDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    flexShrink: 0,
  },
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
  svg: {
    transform: [{ rotate: "-90deg" }],
  },
  percentageLabel: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.normal,
  },
  percentageSkeleton: {
    width: 22,
    height: theme.fontSize.sm,
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
  errorRow: {
    gap: theme.spacing[1],
  },
  errorText: {
    color: theme.colors.palette.red[300],
    fontSize: theme.fontSize.xs,
    lineHeight: theme.fontSize.xs * 1.4,
  },
}));
