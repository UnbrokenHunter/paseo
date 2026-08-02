import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Pressable,
  Text,
  View,
  type LayoutChangeEvent,
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
import { StickyBlockFade, StickyPinFade } from "./pin-fade";
import {
  STICKY_CONVERSATION_ROW_HEIGHT,
  STICKY_PIN_LINE_HEIGHT,
  STICKY_PIN_RULE_GAP,
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
 * Modelled on VS Code's sticky scroll (editor/contrib/stickyScroll): each
 * pinned message is a line of the message's own text in the conversation's own
 * colours, on its own rail, with nothing painted around it. A rule under each
 * line is the only mark, and it sits exactly where that line's message swaps
 * into the pin — the fold is offset to the bottom of this block, so the rule
 * under the last line is the boundary the swap fires at.
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

  // Conversation order, so the message that comes second takes the lower row.
  // That row's top is where the fold sits, so it is the only row a message ever
  // swaps into — the one above it was pinned earlier, from the row it is still
  // in, and does not move as the block grows under it.
  const slots: Array<{ role: "user" | "assistant"; preview: StickyConversationPreview | null }> = [
    { role: "assistant" as const, preview: assistant },
    { role: "user" as const, preview: user },
  ].sort((a, b) => (a.preview?.sequence ?? -1) - (b.preview?.sequence ?? -1));

  return (
    <View style={styles.overlay} pointerEvents="box-none" testID="sticky-conversation-header">
      <View
        style={styles.bar}
        pointerEvents="box-none"
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
      >
        {/* Both rows are always laid out, even with nothing to pin on that side,
            so the fold stays where the strategies put it. A row that pins
            nothing paints nothing. */}
        {slots.map(({ role, preview }) =>
          role === "assistant" && !showAssistantSide ? null : (
            <StickyLine key={role}>
              <StickyRow
                agentId={agentId}
                align={role === "user" ? "right" : "left"}
                role={role}
                preview={preview}
                arrowsVisible={isHovered}
                onPress={onPressPreview}
              />
            </StickyLine>
          ),
        )}
      </View>
      <StickyBlockFade color={styles.fade.color} />
    </View>
  );
}

/**
 * One pinned line, with the message column reproduced inside it. The column is
 * what puts a pin on its message's rail — the list's content padding, then the
 * same inset every stream row gets from `streamItemWrapper` in
 * agent-stream/view.tsx. Rows laid out against the bar instead of this column
 * land a step outside the text.
 */
function StickyLine({ children }: { children: ReactNode }) {
  return (
    <View style={styles.content} pointerEvents="box-none">
      <View style={styles.column} pointerEvents="box-none">
        {children}
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
  /**
   * A pin takes its message's width up to the column, so a pin filling the
   * column is one whose message did not fit on a line — the only thing that
   * should fade. Measuring the two boxes is what makes that knowable: a short
   * message must not fade, and nothing else reports whether the line was cut.
   */
  const [capWidth, setCapWidth] = useState(0);
  const [pinWidth, setPinWidth] = useState(0);
  const handleRowLayout = useCallback((event: LayoutChangeEvent) => {
    setCapWidth(event.nativeEvent.layout.width);
  }, []);
  const handlePinLayout = useCallback((event: LayoutChangeEvent) => {
    setPinWidth(event.nativeEvent.layout.width);
  }, []);
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
  // The row holds its height even when empty, so the rule under the block stays
  // on the fold and the side that is pinned never moves as the other comes and
  // goes.
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
      onLayout={handleRowLayout}
    >
      <Pressable
        style={align === "right" ? userPinStyle : assistantPinStyle}
        onLayout={handlePinLayout}
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
        {/* The text is the pin's only in-flow child, so the pin hugs it up to
            the cap and the rule comes out the length of the line. */}
        <Text style={styles.previewText} numberOfLines={1} ellipsizeMode="clip">
          {preview.text}
        </Text>
        {capWidth > 0 && pinWidth >= capWidth - 1 ? (
          <StickyPinFade color={styles.fade.color} />
        ) : null}
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
const assistantPinStyle = ({ hovered }: PinStyleState): StyleProp<ViewStyle> => [
  styles.pin,
  hovered ? styles.pinHovered : null,
];
const userPinStyle = ({ hovered }: PinStyleState): StyleProp<ViewStyle> => [
  styles.pin,
  styles.pinUser,
  hovered ? styles.pinHovered : null,
];

const styles = StyleSheet.create((theme) => ({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
  },
  /**
   * Painted in the conversation's own surface, the way VS Code's widget is
   * painted in the editor's colours. It carries no border or shadow of its own:
   * the background is only there to stop content scrolling through the pinned
   * text, and the rule under each line is the whole of the treatment.
   */
  bar: {
    backgroundColor: theme.colors.surface0,
  },
  // Matches the list's own content padding.
  content: {
    paddingHorizontal: {
      xs: theme.spacing[3],
      md: theme.spacing[4],
    },
  },
  column: {
    width: "100%",
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: "center",
    paddingHorizontal: theme.spacing[2],
  },
  /**
   * The pin sits on the row's bottom edge, so its rule lands on the row's
   * boundary rather than floating inside it — the last row's rule is then
   * exactly the fold the strategies offset the swap to.
   */
  row: {
    height: STICKY_CONVERSATION_ROW_HEIGHT,
    flexDirection: "row",
    alignItems: "flex-end",
  },
  rowLeft: {
    justifyContent: "flex-start",
  },
  rowRight: {
    justifyContent: "flex-end",
  },
  /**
   * A pinned message is the message's own text — no bubble, no surface of its
   * own, either side. It takes the box that message takes, up to the column, so
   * the text lands in the same place and the rule comes out the length of the
   * message rather than of some box drawn around it.
   */
  pin: {
    maxWidth: "100%",
    flexShrink: 1,
    minWidth: 0,
    paddingBottom: STICKY_PIN_RULE_GAP,
    borderBottomWidth: theme.borderWidth[1],
    borderBottomColor: theme.colors.border,
  },
  /**
   * The prompt's own bubble padding, kept even though the bubble is gone. What
   * has to line up across the handoff is the text, not the box: a prompt's text
   * stops a bubble's padding short of the rail on both sides, so without this
   * the line would step sideways as it pinned. The response has no padding to
   * match — its text starts on the rail already.
   */
  pinUser: {
    paddingHorizontal: theme.spacing[4],
  },
  pinHovered: {
    opacity: 0.7,
  },
  // Read off the stylesheet rather than through a hook: `useUnistyles()` is
  // forbidden (docs/unistyles.md), and the wash has to be the bar's own colour
  // to read as the line running out rather than as a band over it.
  fade: {
    color: theme.colors.surface0,
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
  // The message's own type. A different size or leading would move the line as
  // it pinned, which is the whole thing the handoff is trying to avoid.
  previewText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    lineHeight: STICKY_PIN_LINE_HEIGHT,
  },
}));
