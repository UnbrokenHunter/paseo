import { StyleSheet as RNStyleSheet } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { STICKY_PIN_FADE_END, STICKY_PIN_FADE_START } from "./model";

/** How far the block's cover takes to run out under the last rule. */
export const STICKY_BLOCK_FADE_HEIGHT = 16;

/**
 * Runs a pinned line out before its end, so a message too long to pin whole
 * reaches about three quarters across and dissolves rather than being chopped.
 *
 * Painted as an absolute wash in the bar's own colour rather than masking the
 * text. A mask has to wrap the text, and the wrapper is what sizes the pin —
 * wrapped, a line stops taking its message's width, which is the thing that
 * holds it still across the handoff. Out of flow, this cannot touch the layout.
 */
export function StickyPinFade({ color }: { color: string }) {
  return (
    <Svg
      style={fadeStyles.trailing}
      width="100%"
      height="100%"
      preserveAspectRatio="none"
      pointerEvents="none"
    >
      <Defs>
        <LinearGradient id="sticky-pin-fade" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={color} stopOpacity={0} />
          <Stop offset={STICKY_PIN_FADE_START} stopColor={color} stopOpacity={0} />
          <Stop offset={STICKY_PIN_FADE_END} stopColor={color} stopOpacity={1} />
          <Stop offset="1" stopColor={color} stopOpacity={1} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#sticky-pin-fade)" />
    </Svg>
  );
}

/**
 * Runs the block's cover out below the last rule instead of ending it on an
 * edge. The cover is what stops the conversation showing through the pinned
 * text; cut square, a line of the message passing under it is chopped in half
 * mid-glyph. Over this strip it thins out instead, so the message fades as it
 * goes under.
 */
export function StickyBlockFade({ color }: { color: string }) {
  return (
    <Svg
      style={fadeStyles.bottom}
      width="100%"
      height={STICKY_BLOCK_FADE_HEIGHT}
      preserveAspectRatio="none"
      pointerEvents="none"
    >
      <Defs>
        <LinearGradient id="sticky-block-fade" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity={1} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#sticky-block-fade)" />
    </Svg>
  );
}

const fadeStyles = RNStyleSheet.create({
  // Spans the pin but stops at its padding box, so the rule stays solid.
  trailing: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  bottom: {
    width: "100%",
  },
});
