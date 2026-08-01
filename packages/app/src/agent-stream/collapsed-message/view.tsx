import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Pressable,
  StyleSheet as RNStyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { ChevronDown, ChevronUp } from "lucide-react-native";
import { isNative } from "@/constants/platform";
import { useIsCompactFormFactor } from "@/constants/layout";
import type { Theme } from "@/styles/theme";
import type { AssistantMessageItem, UserMessageItem } from "@/types/stream";
import { CollapsedPreviewFade } from "./preview-fade";
import { setMessageCollapsed, useIsMessageCollapsed } from "./store";

export type CollapsibleMessageRole = "user" | "assistant";
export type CollapsibleMessageItem = UserMessageItem | AssistantMessageItem;

const COLLAPSED_BUBBLE_HEIGHT = 64;
const COLLAPSED_BUBBLE_MARGIN = 8;
/**
 * What a collapsed message costs in the stream: the stub plus its margins.
 * Collapsing has to beat this by enough to be worth the swap.
 */
const COLLAPSED_FOOTPRINT = COLLAPSED_BUBBLE_HEIGHT + COLLAPSED_BUBBLE_MARGIN;
/**
 * A message has to give back about a stub's worth of height again before the
 * control appears. Trading a four-line message for a three-line stub is churn,
 * not a collapse — so the offer starts where the saving is obvious.
 */
const COLLAPSE_MIN_SAVED_HEIGHT = COLLAPSED_FOOTPRINT;
/**
 * The preview lays its content out at the width the message actually had and
 * then clips to the narrower bubble. Re-wrapping at the bubble width would
 * reflow every line into a shape the message never had, and nothing would be
 * clipped horizontally — so the fade would have nothing to fade.
 */
const COLLAPSED_BUBBLE_WIDTH = "75%";
const COLLAPSED_CONTENT_WIDTH = "133.34%";
const TOGGLE_FADE_MS = 140;
const SWAP_FADE_MS = 180;
/** A collapsed bubble always shows its way out, but quietly until pointed at. */
const COLLAPSED_TOGGLE_RESTING_OPACITY = 0.55;

const ThemedChevronDown = withUnistyles(ChevronDown);
const ThemedChevronUp = withUnistyles(ChevronUp);
const toggleIconColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

const TOGGLE_LABEL_KEYS = {
  collapse: {
    user: "agentStream.messageCollapse.collapseUser",
    assistant: "agentStream.messageCollapse.collapseAssistant",
  },
  expand: {
    user: "agentStream.messageCollapse.expandUser",
    assistant: "agentStream.messageCollapse.expandAssistant",
  },
} as const;

interface MessageCollapseToggleProps {
  collapsed: boolean;
  role: CollapsibleMessageRole;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Chevron down opens the message back up, chevron up folds it away. Shared with
 * the sticky header, which drives the same two states from its previews.
 */
export function MessageCollapseToggle({
  collapsed,
  role,
  onPress,
  style,
  testID,
}: MessageCollapseToggleProps) {
  const { t } = useTranslation();
  const buttonStyle = useMemo(() => [positionStyles.toggle, style], [style]);
  const label = t(TOGGLE_LABEL_KEYS[collapsed ? "expand" : "collapse"][role]);
  const Icon = collapsed ? ThemedChevronDown : ThemedChevronUp;

  return (
    <Pressable
      style={buttonStyle}
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
    >
      <Icon size={14} uniProps={toggleIconColorMapping} />
    </Pressable>
  );
}

/**
 * Fades a control to `target` instead of snapping it in. Plain React Native
 * styles only: theme-dependent Unistyles styles on a Reanimated view crash on
 * theme change (docs/unistyles.md).
 */
function FadingSlot({
  target,
  style,
  children,
}: {
  target: number;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const opacity = useSharedValue(target);
  useEffect(() => {
    opacity.value = withTiming(target, { duration: TOGGLE_FADE_MS });
  }, [opacity, target]);
  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const slotStyle = useMemo(() => [style, animatedStyle], [animatedStyle, style]);
  return (
    <Animated.View style={slotStyle} pointerEvents={target > 0 ? "auto" : "none"}>
      {children}
    </Animated.View>
  );
}

/** Fades the message back in whenever it swaps between full and collapsed. */
function useCollapseSwapFade(collapsed: boolean) {
  const opacity = useSharedValue(1);
  const isFirstRunRef = useRef(true);
  useEffect(() => {
    // Skip the first pass: a message scrolling into view has not swapped.
    if (isFirstRunRef.current) {
      isFirstRunRef.current = false;
      return;
    }
    opacity.value = 0;
    opacity.value = withTiming(1, { duration: SWAP_FADE_MS });
  }, [collapsed, opacity]);
  return useAnimatedStyle(() => ({ opacity: opacity.value }));
}

interface CollapsibleStreamMessageProps {
  agentId: string;
  item: CollapsibleMessageItem;
  /**
   * Called only while collapsed. Building the preview eagerly would clip and
   * re-render every message in history on every streaming flush.
   */
  renderPreview: (item: CollapsibleMessageItem) => ReactNode;
  children: ReactNode;
}

/**
 * Wraps a user prompt or AI response with a collapse control, and swaps it for
 * a compact preview bubble while collapsed. Collapsing is presentation only —
 * the item stays in the stream exactly as it was, so a response that is still
 * generating keeps generating and keeps updating the preview.
 */
export function CollapsibleStreamMessage({
  agentId,
  item,
  renderPreview,
  children,
}: CollapsibleStreamMessageProps) {
  const role: CollapsibleMessageRole = item.kind === "user_message" ? "user" : "assistant";
  const collapsed = useIsMessageCollapsed(agentId, item.id);
  const isCompact = useIsCompactFormFactor();
  const [isHovered, setIsHovered] = useState(false);
  const [canCollapse, setCanCollapse] = useState(false);
  const swapFadeStyle = useCollapseSwapFade(collapsed);

  const handlePointerEnter = useCallback(() => setIsHovered(true), []);
  const handlePointerLeave = useCallback(() => setIsHovered(false), []);
  const handleCollapse = useCallback(
    () => setMessageCollapsed({ agentId, itemId: item.id, collapsed: true }),
    [agentId, item.id],
  );
  const handleExpand = useCallback(
    () => setMessageCollapsed({ agentId, itemId: item.id, collapsed: false }),
    [agentId, item.id],
  );
  const handleBodyLayout = useCallback((event: LayoutChangeEvent) => {
    const worthCollapsing =
      event.nativeEvent.layout.height >= COLLAPSED_FOOTPRINT + COLLAPSE_MIN_SAVED_HEIGHT;
    setCanCollapse((previous) => (previous === worthCollapsing ? previous : worthCollapsing));
  }, []);

  const pointedAt = isHovered || isNative || isCompact;
  const messageToggleSlotStyle = useMemo(
    () => [
      positionStyles.toggleSlot,
      role === "user" ? positionStyles.toggleSlotUser : positionStyles.toggleSlotAssistant,
    ],
    [role],
  );
  const collapsedToggleSlotStyle = useMemo(
    () => [
      positionStyles.toggleSlot,
      role === "user"
        ? positionStyles.toggleSlotCollapsedUser
        : positionStyles.toggleSlotCollapsedAssistant,
    ],
    [role],
  );
  const hostStyle = useMemo(
    () => [
      positionStyles.host,
      role === "user" ? positionStyles.hostUser : positionStyles.hostAssistant,
      swapFadeStyle,
    ],
    [role, swapFadeStyle],
  );

  if (collapsed) {
    return (
      <Animated.View
        style={hostStyle}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        testID={`collapsed-message-${role}`}
      >
        <View style={[styles.bubble, role === "user" ? styles.bubbleUser : styles.bubbleAssistant]}>
          <CollapsedPreviewFade style={styles.clip}>
            <View
              style={[
                styles.previewContent,
                role === "user" ? styles.previewContentUser : styles.previewContentAssistant,
              ]}
              pointerEvents="none"
            >
              {renderPreview(item)}
            </View>
          </CollapsedPreviewFade>
          <FadingSlot
            target={pointedAt ? 1 : COLLAPSED_TOGGLE_RESTING_OPACITY}
            style={collapsedToggleSlotStyle}
          >
            <MessageCollapseToggle
              collapsed
              role={role}
              onPress={handleExpand}
              testID={`expand-message-${role}`}
            />
          </FadingSlot>
        </View>
      </Animated.View>
    );
  }

  return (
    <Animated.View
      style={hostStyle}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    >
      {/* Hugs the message on the user side, so the control lands on the bubble's
          own corner rather than the far edge of the column. */}
      <View
        style={role === "user" ? positionStyles.bodyUser : positionStyles.bodyAssistant}
        onLayout={handleBodyLayout}
      >
        {children}
        {canCollapse ? (
          <FadingSlot target={pointedAt ? 1 : 0} style={messageToggleSlotStyle}>
            <MessageCollapseToggle
              collapsed={false}
              role={role}
              onPress={handleCollapse}
              testID={`collapse-message-${role}`}
            />
          </FadingSlot>
        ) : null}
      </View>
    </Animated.View>
  );
}

// Layout only, no theme: these ride on Reanimated views and on the control
// slot inside them (docs/unistyles.md, "Animated.View + Dynamic Styles").
const positionStyles = RNStyleSheet.create({
  host: {
    width: "100%",
    flexDirection: "row",
    alignItems: "flex-start",
  },
  hostUser: {
    justifyContent: "flex-end",
  },
  hostAssistant: {
    justifyContent: "flex-start",
  },
  bodyUser: {
    flexShrink: 1,
    minWidth: 0,
    maxWidth: "100%",
  },
  bodyAssistant: {
    flex: 1,
    minWidth: 0,
  },
  // The arrow sits at the message's top outer corner — the side that message is
  // anchored to, so AI top left and user top right, matching the sticky header.
  // It stays inside the message's own box, because Android drops touches on
  // anything outside a parent's bounds, and each role offsets into the padding
  // its own content already has so the arrow never lands on a glyph.
  toggleSlot: {
    position: "absolute",
  },
  toggleSlotAssistant: {
    top: -6,
    left: -1,
  },
  toggleSlotUser: {
    top: 1,
    right: 3,
  },
  toggleSlotCollapsedAssistant: {
    top: 4,
    left: 4,
  },
  toggleSlotCollapsedUser: {
    top: 4,
    right: 4,
  },
  toggle: {
    padding: 1,
  },
});

const styles = StyleSheet.create((theme) => ({
  bubble: {
    width: COLLAPSED_BUBBLE_WIDTH,
    height: COLLAPSED_BUBBLE_HEIGHT,
    marginVertical: COLLAPSED_BUBBLE_MARGIN / 2,
    borderRadius: theme.borderRadius["2xl"],
    overflow: "hidden",
  },
  // The square corner faces the author, the same way an expanded user bubble
  // squares its top right.
  bubbleUser: {
    backgroundColor: theme.colors.surface3,
    borderTopRightRadius: theme.borderRadius.sm,
  },
  bubbleAssistant: {
    backgroundColor: theme.colors.surface1,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    borderTopLeftRadius: theme.borderRadius.sm,
  },
  clip: {
    flex: 1,
    overflow: "hidden",
  },
  previewContent: {
    width: COLLAPSED_CONTENT_WIDTH,
    paddingRight: theme.spacing[3],
    paddingTop: theme.spacing[2],
  },
  // Only the AI side has to make room for its arrow. The user's sits at the top
  // right, over the edge the preview fades out at.
  previewContentAssistant: {
    paddingLeft: theme.spacing[6],
  },
  previewContentUser: {
    paddingLeft: theme.spacing[3],
  },
}));
