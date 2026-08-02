import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View, type ViewStyle } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { MAX_CONTENT_WIDTH, useIsCompactFormFactor } from "@/constants/layout";
import { isNative, isWeb } from "@/constants/platform";
import type { StickyConversationHeaderMode } from "@/hooks/use-settings";
import { MessageCollapseToggle } from "../collapsed-message/view";
import {
  toggleMessageCollapsed,
  useIsMessageCollapsed,
  useIsMessageCollapsible,
} from "../collapsed-message/store";
import {
  STICKY_CONVERSATION_ROW_HEIGHT,
  type StickyConversationPreview,
  type StickyConversationPreviews,
} from "./model";

export { STICKY_CONVERSATION_ROW_HEIGHT };

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

/**
 * The last prompt and response, pinned where they left the screen.
 *
 * Each one keeps the shape it has in the conversation — the prompt as its own
 * bubble on the right, the response as text on the left rail — and only as much
 * width as its text needs. A full-width bar across the top read as a separate
 * piece of chrome instead of as the messages themselves holding on.
 *
 * The two stack rather than share a row, in the order they sit on their sides,
 * so a pinned pair reads the way the conversation does.
 */
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
      <View style={styles.column} pointerEvents="box-none">
        {showAssistantSide ? (
          <StickyRow
            agentId={agentId}
            align="left"
            role="assistant"
            preview={assistant}
            onPress={onPressPreview}
          />
        ) : null}
        <StickyRow
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

interface StickyRowProps {
  agentId: string;
  align: "left" | "right";
  role: "user" | "assistant";
  preview: StickyConversationPreview | null;
  onPress: (itemId: string) => void;
}

function StickyRow({ agentId, align, role, preview, onPress }: StickyRowProps) {
  const { t } = useTranslation();
  const isCompact = useIsCompactFormFactor();
  const [isHovered, setIsHovered] = useState(false);
  const itemId = preview?.itemId;
  const collapsed = useIsMessageCollapsed(agentId, itemId ?? "");
  // A message too short to be worth collapsing gets no control here either.
  const collapsible = useIsMessageCollapsible(agentId, itemId ?? "");
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

  // The row holds its height even when empty, so the side that is pinned never
  // moves as the other one comes and goes.
  if (!preview) {
    return <View style={styles.row} pointerEvents="none" />;
  }

  const showToggle = isHovered || isNative || isCompact;
  const toggle = collapsible ? (
    <View
      style={showToggle ? styles.toggleVisible : styles.toggleHidden}
      pointerEvents={showToggle ? "auto" : "none"}
    >
      <MessageCollapseToggle
        collapsed={collapsed}
        role={role}
        onPress={handleToggle}
        testID={`sticky-conversation-collapse-${role}`}
      />
    </View>
  ) : null;

  return (
    <View
      style={[styles.row, align === "left" ? styles.rowLeft : styles.rowRight]}
      pointerEvents="box-none"
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    >
      {/* Outer side first on the AI row, last on the user row: the arrow takes
          the same corner it does on the message itself. */}
      {align === "left" ? toggle : null}
      <Pressable
        style={[
          styles.pin,
          backdropBlurStyle,
          align === "left" ? styles.pinAssistant : styles.pinUser,
        ]}
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
        <Text style={styles.previewText} numberOfLines={1} ellipsizeMode="tail">
          {preview.text}
        </Text>
      </Pressable>
      {align === "right" ? toggle : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
  },
  column: {
    width: "100%",
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: "center",
    // A little air at the top so a pin reads as floating over the conversation
    // rather than welded to the edge of the panel.
    paddingTop: theme.spacing[2],
    paddingHorizontal: {
      xs: theme.spacing[3],
      md: theme.spacing[4],
    },
  },
  row: {
    height: STICKY_CONVERSATION_ROW_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  rowLeft: {
    justifyContent: "flex-start",
  },
  rowRight: {
    justifyContent: "flex-end",
  },
  // Only as wide as the text, up to most of the column — a pinned message keeps
  // its own width rather than stretching into a bar.
  pin: {
    maxWidth: "88%",
    flexShrink: 1,
    minWidth: 0,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.borderRadius["2xl"],
    ...theme.shadow.sm,
  },
  // Each side squares the corner that faces its author, the same way its
  // message does, and carries its message's own surface.
  pinAssistant: {
    backgroundColor: theme.colors.surface1,
    borderTopLeftRadius: theme.borderRadius.sm,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
  },
  pinUser: {
    backgroundColor: theme.colors.surface3,
    borderTopRightRadius: theme.borderRadius.sm,
  },
  toggleVisible: {
    opacity: 1,
  },
  toggleHidden: {
    opacity: 0,
  },
  previewText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
}));
