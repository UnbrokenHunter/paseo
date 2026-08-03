import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
import { parseStickyPreviewSpans } from "./inline-preview";
import { StickyBlockFade } from "./block-fade";
import {
  STICKY_CONVERSATION_ROW_HEIGHT,
  STICKY_PIN_LINE_HEIGHT,
  STICKY_PIN_VERTICAL_PADDING,
  type StickyConversationPreview,
  type StickyConversationPreviews,
} from "./model";

export { STICKY_CONVERSATION_ROW_HEIGHT };

interface StickyConversationHeaderProps {
  agentId: string;
  mode: StickyConversationHeaderMode;
  previews: StickyConversationPreviews;
  /**
   * How far the block has ridden up as the next message closes on the fold,
   * from `stickyConversationPushOffset`. 0 while the block sits still.
   */
  pushOffset: number;
  /**
   * How far the block has revealed as it attaches, 0..1 from
   * `stickyBlockRevealProgress`. Total scroll from the top, so it plays once: the
   * surface and the prompt bubble fade in on it and then stay. The pinned text is
   * placed and held, never tied to it.
   */
  revealProgress: number;
  /**
   * How far the pinned response's rule has extended, 0..1 from
   * `stickyBlockBarRevealProgress`. Per-response scroll, so it replays for each
   * response — the underline wipes out from the text's edge as you read down it.
   */
  barProgress: number;
  /**
   * Width the conversation's scrollbar takes out of its own box. The block is
   * laid out over the whole pane, so it has to give the same width back or its
   * column centres against a wider box than the conversation's and every pinned
   * line sits half a scrollbar inboard of the message it stands for.
   */
  gutterWidth: number;
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
  pushOffset,
  revealProgress,
  barProgress,
  gutterWidth,
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
  const blockStyle = useMemo(
    () => [styles.block, { transform: [{ translateY: -pushOffset }] }],
    [pushOffset],
  );
  // The surface and the wash fade in on the scroll; the pinned text is placed
  // and held, so it is never tied to this opacity. The response rule rides the
  // same progress but extends rather than fades — see StickyRow.
  const surfaceStyle = useMemo(
    () => [styles.barBackground, { opacity: revealProgress }],
    [revealProgress],
  );
  const overlayStyle = useMemo(() => [styles.overlay, { right: gutterWidth }], [gutterWidth]);

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
    <View style={overlayStyle} pointerEvents="box-none" testID="sticky-conversation-header">
      {/* The block rides up out of this box as the next message arrives, so the
          line that has been pinned longest leaves the top of the screen the way
          any other content does. The clip is what makes it leave rather than
          ride over the toolbar above; it only bites at the pane's own edges,
          which the arrows in the margins stay inside of. */}
      <View style={blockStyle} pointerEvents="box-none">
        <View
          style={styles.bar}
          pointerEvents="box-none"
          onPointerEnter={handlePointerEnter}
          onPointerLeave={handlePointerLeave}
        >
          {/* The surface sits behind the rows and carries the reveal; the pinned
              text paints on top of it at full strength. */}
          <View style={surfaceStyle} pointerEvents="none" />
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
                  revealProgress={revealProgress}
                  barProgress={barProgress}
                  onPress={onPressPreview}
                />
              </StickyLine>
            ),
          )}
        </View>
        <StickyBlockFade color={styles.fade.color} opacity={revealProgress} />
      </View>
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
  /** How far the surface has revealed, 0..1 — the prompt bubble fades on it. */
  revealProgress: number;
  /** How far the response rule has extended, 0..1 — it wipes out on this. */
  barProgress: number;
  onPress: (itemId: string) => void;
}

function StickyRow({
  agentId,
  align,
  role,
  preview,
  arrowsVisible,
  revealProgress,
  barProgress,
  onPress,
}: StickyRowProps) {
  const { t } = useTranslation();
  const isCompact = useIsCompactFormFactor();
  const itemId = preview?.itemId;
  const collapsed = useIsMessageCollapsed(agentId, itemId ?? "");
  // A message too short to be worth collapsing gets no control here either.
  const collapsible = useIsMessageCollapsible(agentId, itemId ?? "");
  const spans = useMemo(() => parseStickyPreviewSpans(preview?.text ?? ""), [preview?.text]);
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
    >
      <Pressable
        style={align === "right" ? userPinStyle : assistantPinStyle}
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
        {/* The chrome sits behind the text and carries the reveal: a prompt's
            bubble, or a response's rule at the fold. The text hugs the pin, so
            both come out the length of the line. The rule extends from the text's
            own edge as you read down the response; the bubble, being a surface,
            fades in with the block instead. */}
        {align === "right" ? (
          <View style={[styles.pinBubble, { opacity: revealProgress }]} pointerEvents="none" />
        ) : (
          <View
            style={[
              styles.pinRule,
              { transform: [{ scaleX: barProgress }], transformOrigin: "center left" },
            ]}
            pointerEvents="none"
          />
        )}
        {/* The text is the pin's only laid-out child, so the pin hugs it up to
            the cap and the chrome behind it comes out the length of the line. A
            line too long to pin whole ends in an ellipsis, the way any cut line
            does. */}
        <Text style={styles.previewText} numberOfLines={1} ellipsizeMode="tail">
          {spans.map((span) => (
            <Text
              key={span.offset}
              style={[
                span.bold ? styles.spanBold : null,
                span.italic ? styles.spanItalic : null,
                span.code ? styles.spanCode : null,
                span.strike ? styles.spanStrike : null,
              ]}
            >
              {span.text}
            </Text>
          ))}
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
    overflow: "hidden",
  },
  block: {
    width: "100%",
  },
  /**
   * Groups the pinned rows and the wash. It carries no surface of its own — the
   * surface is a separate layer behind the rows (`barBackground`) so it can rise
   * with the scroll while the text stays at full strength.
   */
  bar: {},
  /**
   * The conversation's own surface, the way VS Code's widget is painted in the
   * editor's colours. It carries no border or shadow: the surface is only there
   * to stop content scrolling through the pinned text, and it eases in behind
   * that text rather than snapping on with it.
   */
  barBackground: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
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
   * The pin fills the row, so the rule under a response lands on the row's
   * boundary rather than floating inside it — the last row's rule is then
   * exactly the fold the strategies offset the swap to.
   */
  row: {
    height: STICKY_CONVERSATION_ROW_HEIGHT,
    flexDirection: "row",
    alignItems: "stretch",
  },
  rowLeft: {
    justifyContent: "flex-start",
  },
  rowRight: {
    justifyContent: "flex-end",
  },
  /**
   * A response is its own text on the page, no surface of its own. It takes the
   * box the message takes, up to the column, so the text lands in the same place
   * and its rule (`pinRule`) comes out the length of the message rather than of
   * some box drawn around it. The padding is the prompt bubble's, which the
   * response has no use for except to put its text at the same depth — see
   * `STICKY_PIN_VERTICAL_PADDING`.
   */
  pin: {
    maxWidth: "100%",
    flexShrink: 1,
    minWidth: 0,
    paddingVertical: STICKY_PIN_VERTICAL_PADDING,
  },
  /**
   * The response's rule at the fold, drawn as its own layer behind the text so
   * it can rise with the scroll. The pin fills the row, so the rule lands on the
   * row's boundary — the last row's rule is then exactly the fold the strategies
   * offset the swap to.
   */
  pinRule: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: theme.borderWidth[1],
    backgroundColor: theme.colors.border,
  },
  /**
   * A prompt keeps its bubble, at the size the conversation draws it —
   * `userMessageStylesheet.bubble` in components/message.tsx, padding and radii
   * both. Everything else in the conversation reads as a prompt by its bubble,
   * so a pin without one turns a long prompt into something that looks like a
   * response, and a pin with a thinner one reads as a different element again.
   *
   * `pinUser` keeps only the padding that places the text; the bubble itself is
   * a layer behind it (`pinBubble`) so it can rise with the scroll. The rule
   * belongs to the response side only — under a rounded bubble it reads as a box
   * that has been cut, not as the mark of the fold.
   */
  pinUser: {
    paddingHorizontal: theme.spacing[4],
  },
  pinBubble: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.colors.surface3,
    borderRadius: theme.borderRadius["2xl"],
    borderTopRightRadius: theme.borderRadius.sm,
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
  // The message's own inline marks. Without them the line is the source rather
  // than the text — `**like this**` — and the glyphs are the wrong width, so it
  // does not even sit still across the handoff.
  spanBold: {
    fontWeight: "600",
  },
  spanItalic: {
    fontStyle: "italic",
  },
  spanCode: {
    fontFamily: theme.fontFamily.mono,
  },
  spanStrike: {
    textDecorationLine: "line-through",
  },
}));
