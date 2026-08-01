import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { ChevronsDownUp, ChevronsUpDown } from "lucide-react-native";
import { isNative } from "@/constants/platform";
import { useIsCompactFormFactor } from "@/constants/layout";
import type { Theme } from "@/styles/theme";
import type { AssistantMessageItem, UserMessageItem } from "@/types/stream";
import { formatMessageTimestamp } from "@/utils/time";
import { CollapsedPreviewFade } from "./preview-fade";
import { setMessageCollapsed, useIsMessageCollapsed } from "./store";

export type CollapsibleMessageRole = "user" | "assistant";
export type CollapsibleMessageItem = UserMessageItem | AssistantMessageItem;

/**
 * Every collapsed bubble is this size whatever the message was, so a collapsed
 * conversation reads as a column of uniform stubs instead of a second, smaller
 * version of the same uneven layout.
 */
const COLLAPSED_BUBBLE_WIDTH = 240;
const COLLAPSED_BUBBLE_HEIGHT = 64;
/**
 * The preview lays its content out at this width and then clips to the bubble.
 * Wrapping at the bubble width instead would reflow every line and lose the
 * horizontal clip the fade is there to show.
 */
const COLLAPSED_PREVIEW_CONTENT_WIDTH = 520;

const ThemedChevronsDownUp = withUnistyles(ChevronsDownUp);
const ThemedChevronsUpDown = withUnistyles(ChevronsUpDown);
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

/** Shared collapse/expand button — used on the message and in the sticky header. */
export function MessageCollapseToggle({
  collapsed,
  role,
  onPress,
  style,
  testID,
}: MessageCollapseToggleProps) {
  const { t } = useTranslation();
  const buttonStyle = useMemo(() => [styles.toggleButton, style], [style]);
  const label = t(TOGGLE_LABEL_KEYS[collapsed ? "expand" : "collapse"][role]);
  const Icon = collapsed ? ThemedChevronsUpDown : ThemedChevronsDownUp;

  return (
    <Pressable
      style={buttonStyle}
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
    >
      <Icon size={14} uniProps={toggleIconColorMapping} />
    </Pressable>
  );
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
  const handlePointerEnter = useCallback(() => setIsHovered(true), []);
  const handlePointerLeave = useCallback(() => setIsHovered(false), []);
  const handleCollapse = useCallback(
    () => setMessageCollapsed({ agentId, itemId: item.id, collapsed: true }),
    [agentId, item.id],
  );

  const showControl = isHovered || isNative || isCompact;
  const controlStyle = useMemo(
    () => [
      styles.messageControl,
      role === "user" ? styles.messageControlUser : styles.messageControlAssistant,
      showControl ? styles.messageControlVisible : styles.messageControlHidden,
    ],
    [role, showControl],
  );

  if (collapsed) {
    return (
      <CollapsedMessageBubble agentId={agentId} item={item} role={role}>
        {renderPreview(item)}
      </CollapsedMessageBubble>
    );
  }

  return (
    <View
      style={styles.messageHost}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    >
      {children}
      <View style={controlStyle} pointerEvents={showControl ? "auto" : "none"}>
        <MessageCollapseToggle
          collapsed={false}
          role={role}
          onPress={handleCollapse}
          testID={`collapse-message-${role}`}
        />
      </View>
    </View>
  );
}

interface CollapsedMessageBubbleProps {
  agentId: string;
  item: CollapsibleMessageItem;
  role: CollapsibleMessageRole;
  children: ReactNode;
}

function CollapsedMessageBubble({ agentId, item, role, children }: CollapsedMessageBubbleProps) {
  const handleExpand = useCallback(
    () => setMessageCollapsed({ agentId, itemId: item.id, collapsed: false }),
    [agentId, item.id],
  );
  const timestamp = useMemo(() => formatMessageTimestamp(item.timestamp), [item.timestamp]);
  const rowStyle = useMemo(
    () => [styles.collapsedRow, role === "user" ? styles.collapsedRowUser : null],
    [role],
  );
  const timestampNode = <Text style={styles.collapsedTimestamp}>{timestamp}</Text>;

  return (
    <View style={rowStyle} testID={`collapsed-message-${role}`}>
      {role === "user" ? timestampNode : null}
      <View style={styles.collapsedBubble}>
        <CollapsedPreviewFade style={styles.collapsedClip}>
          <View style={styles.collapsedContent} pointerEvents="none">
            {children}
          </View>
        </CollapsedPreviewFade>
        <MessageCollapseToggle
          collapsed
          role={role}
          onPress={handleExpand}
          style={styles.collapsedToggle}
          testID={`expand-message-${role}`}
        />
      </View>
      {role === "assistant" ? timestampNode : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  messageHost: {
    position: "relative",
  },
  messageControl: {
    position: "absolute",
    top: 0,
  },
  messageControlAssistant: {
    right: 0,
  },
  messageControlUser: {
    left: 0,
  },
  messageControlVisible: {
    opacity: 1,
  },
  messageControlHidden: {
    opacity: 0,
  },
  toggleButton: {
    width: 24,
    height: 24,
    borderRadius: theme.borderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface2,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
  },
  collapsedRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: theme.spacing[2],
    marginVertical: theme.spacing[2],
  },
  collapsedRowUser: {
    justifyContent: "flex-end",
  },
  collapsedBubble: {
    width: COLLAPSED_BUBBLE_WIDTH,
    height: COLLAPSED_BUBBLE_HEIGHT,
    borderRadius: theme.borderRadius.xl,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface1,
    overflow: "hidden",
  },
  collapsedClip: {
    flex: 1,
    overflow: "hidden",
  },
  collapsedContent: {
    width: COLLAPSED_PREVIEW_CONTENT_WIDTH,
    paddingHorizontal: theme.spacing[3],
    paddingTop: theme.spacing[2],
  },
  // Pinned over the faded right edge, where it never hides readable preview.
  collapsedToggle: {
    position: "absolute",
    top: theme.spacing[1],
    right: theme.spacing[1],
  },
  collapsedTimestamp: {
    color: theme.colors.foregroundExtraMuted,
    fontSize: theme.fontSize.xs,
  },
}));
