import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Pressable,
  Text,
  View,
  type PressableStateCallbackType,
  type StyleProp,
  type ViewStyle,
} from "react-native";
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
 * Modelled on VS Code's sticky scroll (editor/contrib/stickyScroll): the bar
 * is painted in the surface's own colours, and a bottom border and shadow
 * alone say "held above". Each pin keeps the shape its message has — the
 * prompt as its own bubble on the right rail, the response as plain text on
 * the left — and the arrows hang in the margins outside the text, so a pinned
 * line sits exactly on the rail the message itself uses.
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
  // The arrows hang outside the rows, in the margins; a brief hide delay keeps
  // an arrow alive while the pointer crosses the gap between its pin and it.
  const [isHovered, setIsHovered] = useState(false);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handlePointerEnter = useCallback(() => {
    if (hideTimeoutRef.current !== null) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    setIsHovered(true);
  }, []);
  const handlePointerLeave = useCallback(() => {
    if (hideTimeoutRef.current !== null) {
      clearTimeout(hideTimeoutRef.current);
    }
    hideTimeoutRef.current = setTimeout(() => setIsHovered(false), 150);
  }, []);
  useEffect(
    () => () => {
      if (hideTimeoutRef.current !== null) {
        clearTimeout(hideTimeoutRef.current);
      }
    },
    [],
  );

  if (mode === "off" || (!assistant && !user)) {
    return null;
  }

  return (
    <View style={styles.overlay} pointerEvents="box-none" testID="sticky-conversation-header">
      <View style={styles.bar} pointerEvents="box-none">
        <View style={styles.content} pointerEvents="box-none">
          <View
            style={styles.column}
            pointerEvents="box-none"
            onPointerEnter={handlePointerEnter}
            onPointerLeave={handlePointerLeave}
          >
            {showAssistantSide ? (
              <StickyRow
                agentId={agentId}
                align="left"
                role="assistant"
                preview={assistant}
                arrowsVisible={isHovered}
                onPress={onPressPreview}
              />
            ) : null}
            <StickyRow
              agentId={agentId}
              align="right"
              role="user"
              preview={user}
              arrowsVisible={isHovered}
              onPress={onPressPreview}
            />
          </View>
        </View>
      </View>
    </View>
  );
}

interface StickyRowProps {
  agentId: string;
  align: "left" | "right";
  role: "user" | "assistant";
  preview: StickyConversationPreview | null;
  arrowsVisible: boolean;
  onPress: (itemId: string) => void;
}

function StickyRow({ agentId, align, role, preview, arrowsVisible, onPress }: StickyRowProps) {
  const { t } = useTranslation();
  const isCompact = useIsCompactFormFactor();
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
  const pinStyle = useMemo(() => buildPinStyle(align), [align]);

  // The row holds its height even when empty, so the side that is pinned never
  // moves as the other one comes and goes.
  if (!preview) {
    return <View style={styles.row} pointerEvents="none" />;
  }

  const showToggle = arrowsVisible || isNative || isCompact;
  const toggle = collapsible ? (
    <View
      style={[
        align === "left" ? styles.toggleLeft : styles.toggleRight,
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
  ) : null;

  return (
    <View
      style={[styles.row, align === "left" ? styles.rowLeft : styles.rowRight]}
      pointerEvents="box-none"
    >
      <Pressable
        style={pinStyle}
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
      {/* Hung outside the row's own box, in the margin the conversation keeps
          beside every message, so the pinned text never moves to make room. */}
      {toggle}
    </View>
  );
}

type PinStyleState = PressableStateCallbackType & { hovered?: boolean };

// Hoisted out of the JSX (react-perf) and typed for the web's `hovered` state,
// the same pattern as `PressableStyleFn` in git/diff-pane.tsx.
function buildPinStyle(align: "left" | "right") {
  return ({ hovered }: PinStyleState): StyleProp<ViewStyle> => [
    styles.pin,
    align === "right" ? styles.pinUser : null,
    hovered ? styles.pinHovered : null,
  ];
}

const styles = StyleSheet.create((theme) => ({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
  },
  /**
   * Painted in the conversation's own surface, the way VS Code's widget is
   * painted in the editor's colours — the bottom border and shadow alone mark
   * it as held above the content scrolling underneath.
   */
  bar: {
    backgroundColor: theme.colors.surface0,
    borderBottomWidth: theme.borderWidth[1],
    borderBottomColor: theme.colors.border,
    ...theme.shadow.sm,
  },
  // Matches the list's own content padding.
  content: {
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
  },
  /**
   * A prompt is a bubble in the conversation, so its pin is the same bubble:
   * same surface, same squared top-right corner, and the same horizontal
   * padding, which puts the pinned text on the same rail as the real one. The
   * response pin gets no paint of its own — plain text straight on the bar,
   * exactly as the message sits on the conversation surface.
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
  /**
   * Arrows live just past the row's own box, in the margin the conversation
   * keeps beside every message, so the pinned text never shifts to make room
   * for one. `right: "100%"` anchors the control's far edge to the rail.
   */
  toggleLeft: {
    position: "absolute",
    right: "100%",
    top: 0,
    bottom: 0,
    marginRight: theme.spacing[1],
    justifyContent: "center",
  },
  toggleRight: {
    position: "absolute",
    left: "100%",
    top: 0,
    bottom: 0,
    marginLeft: theme.spacing[1],
    justifyContent: "center",
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
