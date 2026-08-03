import { StyleSheet as RNStyleSheet } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

/** How far the block's cover takes to run out under the last rule. */
export const STICKY_BLOCK_FADE_HEIGHT = 16;

/**
 * Runs the block's cover out below the last rule instead of ending it on an
 * edge. The cover is what stops the conversation showing through the pinned
 * text; cut square, a line of the message passing under it is chopped in half
 * mid-glyph. Over this strip it thins out instead, so the message fades as it
 * goes under.
 */
export function StickyBlockFade({ color, opacity = 1 }: { color: string; opacity?: number }) {
  return (
    <Svg
      style={[fadeStyles.bottom, { opacity }]}
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
  bottom: {
    width: "100%",
  },
});
