import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Pressable,
  Text,
  View,
  type PressableStateCallbackType,
  type ViewStyle,
} from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { MAX_CONTENT_WIDTH, useIsCompactFormFactor } from "@/constants/layout";
import { isNative, isWeb } from "@/constants/platform";
import type { StickyConversationHeaderMode } from "@/hooks/use-settings";
import { formatMessageTimestamp } from "@/utils/time";
import { MessageCollapseToggle } from "../collapsed-message/view";
import { toggleMessageCollapsed, useIsMessageCollapsed } from "../collapsed-message/store";
import {
  STICKY_CONVERSATION_HEADER_HEIGHT,
  type StickyConversationPreview,
  type StickyConversationPreviews,
} from "./model";

export { STICKY_CONVERSATION_HEADER_HEIGHT };

/** Width reserved beside each preview for the collapse/expand toggle. */
const TOGGLE_SLOT_WIDTH = 28;

// Plain (non-Unistyles) object: `backdropFilter` has no React Native equivalent.
const backdropBlurStyle = isWeb
  ? ({
      backdropFilter: "blur(12px)",
      WebkitBackdropFilter: "blur(12px)",
    } as unknown as ViewStyle)
  : null;

interface StickyConversationHeaderProps {
  agentId: string;
  mode: StickyConversationHeaderMode;
  previews: StickyConversationPreviews;
  onPressPreview: (itemId: string) => void;
}

export function StickyConversationHeader({
  agentId,
  mode,
  previews,
  onPressPreview,
}: StickyConversationHeaderProps) {
  const showAssistantSide = mode === "user-and-ai";
  const assistant = showAssistantSide ? previews.assistant : null;
  const user = previews.user;

  if (mode === "off" || (!assistant && !user)) {
    return null;
  }

  return (
    <View style={styles.overlay} pointerEvents="box-none" testID="sticky-conversation-header">
      <View style={[styles.backdrop, backdropBlurStyle]} pointerEvents="none" />
      <View style={styles.row} pointerEvents="box-none">
        {showAssistantSide ? (
          <StickySide
            agentId={agentId}
            align="left"
            role="assistant"
            preview={assistant}
            onPress={onPressPreview}
          />
        ) : null}
        <StickySide
          agentId={agentId}
          align="right"
          role="user"
          preview={user}
          onPress={onPressPreview}
        />
      </View>
    </View>
  );
}

function sidePressableStyle({ pressed }: PressableStateCallbackType) {
  return pressed ? styles.sidePressed : null;
}

interface StickySideProps {
  agentId: string;
  align: "left" | "right";
  role: "user" | "assistant";
  preview: StickyConversationPreview | null;
  onPress: (itemId: string) => void;
}

function StickySide({ agentId, align, role, preview, onPress }: StickySideProps) {
  const { t } = useTranslation();
  const isCompact = useIsCompactFormFactor();
  const [isHovered, setIsHovered] = useState(false);
  const itemId = preview?.itemId;
  const collapsed = useIsMessageCollapsed(agentId, itemId ?? "");
  const handlePress = useCallback(() => {
    if (itemId) {
      onPress(itemId);
    }
  }, [itemId, onPress]);
  const handleToggle = useCallback(() => {
    if (itemId) {
      toggleMessageCollapsed({ agentId, itemId });
    }
  }, [agentId, itemId]);
  const handlePointerEnter = useCallback(() => setIsHovered(true), []);
  const handlePointerLeave = useCallback(() => setIsHovered(false), []);
  const timestamp = useMemo(
    () => (preview ? formatMessageTimestamp(new Date(preview.timestamp)) : ""),
    [preview],
  );

  if (!preview) {
    return <View style={styles.side} />;
  }

  const alignmentStyle = align === "left" ? styles.alignStart : styles.alignEnd;
  const textAlignStyle = align === "left" ? styles.textStart : styles.textEnd;
  const showToggle = isHovered || isNative || isCompact;

  return (
    <View
      style={styles.side}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    >
      <Pressable
        style={sidePressableStyle}
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel={t(
          role === "user"
            ? "agentStream.stickyHeader.userAccessibilityLabel"
            : "agentStream.stickyHeader.assistantAccessibilityLabel",
          { preview: preview.text },
        )}
        testID={`sticky-conversation-preview-${role}`}
      >
        <View style={[alignmentStyle, align === "left" ? styles.insetStart : styles.insetEnd]}>
          <Text style={[styles.previewText, textAlignStyle]} numberOfLines={1} ellipsizeMode="tail">
            {preview.text}
          </Text>
          <Text style={[styles.timestamp, textAlignStyle]} numberOfLines={1}>
            {timestamp}
          </Text>
        </View>
      </Pressable>
      <View
        style={[
          styles.toggleSlot,
          align === "left" ? styles.toggleSlotStart : styles.toggleSlotEnd,
          showToggle ? styles.toggleVisible : styles.toggleHidden,
        ]}
        pointerEvents={showToggle ? "auto" : "none"}
      >
        <MessageCollapseToggle
          collapsed={collapsed}
          role={role}
          onPress={handleToggle}
          testID={`sticky-conversation-collapse-${role}`}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: STICKY_CONVERSATION_HEADER_HEIGHT,
  },
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.colors.surface0,
    opacity: 0.82,
    borderBottomWidth: theme.borderWidth[1],
    borderBottomColor: theme.colors.border,
  },
  row: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
    width: "100%",
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: "center",
    paddingHorizontal: {
      xs: theme.spacing[3],
      md: theme.spacing[4],
    },
  },
  side: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  // Each side's toggle sits on its own outer edge — AI left, user right — the
  // same corner the arrow takes on the message itself. The toggle is absolute
  // and the inset is unconditional, so revealing it on hover cannot move the
  // preview out from under the cursor.
  insetStart: {
    paddingLeft: TOGGLE_SLOT_WIDTH,
  },
  insetEnd: {
    paddingRight: TOGGLE_SLOT_WIDTH,
  },
  toggleSlot: {
    position: "absolute",
    top: 0,
    bottom: 0,
    justifyContent: "center",
  },
  toggleSlotStart: {
    left: 0,
  },
  toggleSlotEnd: {
    right: 0,
  },
  toggleVisible: {
    opacity: 1,
  },
  toggleHidden: {
    opacity: 0,
  },
  sidePressed: {
    opacity: 0.7,
  },
  alignStart: {
    alignItems: "flex-start",
  },
  alignEnd: {
    alignItems: "flex-end",
  },
  textStart: {
    textAlign: "left",
  },
  textEnd: {
    textAlign: "right",
  },
  previewText: {
    width: "100%",
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  timestamp: {
    width: "100%",
    marginTop: 1,
    color: theme.colors.foregroundExtraMuted,
    fontSize: theme.fontSize.xs,
  },
}));
