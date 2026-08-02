import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { MAX_CONTENT_WIDTH, useIsCompactFormFactor } from "@/constants/layout";
import { isNative } from "@/constants/platform";
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
          align === "left" ? styles.pinAssistant : styles.pinUser,
          isHovered ? styles.pinHovered : null,
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
    // Matches the list's own content padding.
    paddingHorizontal: {
      xs: theme.spacing[3],
      md: theme.spacing[4],
    },
  },
  /**
   * The same box a stream row gets — `stylesheet.streamItemWrapper` in
   * agent-stream/view.tsx — so a pin lands on the message's own rail. Missing
   * this inner inset is what put every pin a step outside the text it came
   * from.
   */
  column: {
    width: "100%",
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: "center",
    paddingHorizontal: theme.spacing[2],
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
    paddingVertical: theme.spacing[1],
    justifyContent: "center",
    // The one thing that separates a pin from the content sliding under it.
    // VS Code's sticky widget is otherwise painted in the editor's own colours;
    // the shadow is what says "held above" rather than "different surface".
    ...theme.shadow.sm,
  },
  /**
   * No padding on the left and the conversation's own background: the pinned
   * text starts exactly where the response's text starts, and is painted in the
   * surface it was already on. Only the shadow marks it as pinned.
   */
  pinAssistant: {
    backgroundColor: theme.colors.surface0,
    paddingRight: theme.spacing[3],
    borderTopRightRadius: theme.borderRadius.lg,
    borderBottomRightRadius: theme.borderRadius.lg,
  },
  /**
   * A prompt is a bubble in the conversation, so its pin is the same bubble:
   * same surface, same squared top-right corner, and the same horizontal
   * padding, which puts the pinned text on the same rail as the real one.
   */
  pinUser: {
    backgroundColor: theme.colors.surface3,
    paddingHorizontal: theme.spacing[4],
    borderRadius: theme.borderRadius["2xl"],
    borderTopRightRadius: theme.borderRadius.sm,
  },
  pinHovered: {
    opacity: 0.9,
  },
  toggleVisible: {
    opacity: 1,
  },
  toggleHidden: {
    opacity: 0,
  },
  previewText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
  },
}));
