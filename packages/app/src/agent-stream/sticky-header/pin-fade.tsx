import { StyleSheet as RNStyleSheet } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

export const STICKY_PIN_FADE_WIDTH = 44;

/**
 * Fades a pinned line out at its trailing edge, so a message longer than its
 * pin reads as carrying on rather than being chopped.
 *
 * Painted as an absolute wash in the bar's own colour rather than masking the
 * text. A mask has to wrap the text in a view, and the wrapper is what sizes
 * the pin — wrapped, a long line stops hugging and spills out of the column
 * instead of stopping at the cap. Out of flow, this cannot touch the layout.
 */
export function StickyPinFade({ color }: { color: string }) {
  return (
    <Svg
      style={fadeStyles.fade}
      width={STICKY_PIN_FADE_WIDTH}
      height="100%"
      preserveAspectRatio="none"
      pointerEvents="none"
    >
      <Defs>
        <LinearGradient id="sticky-pin-fade" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={color} stopOpacity={0} />
          <Stop offset="1" stopColor={color} stopOpacity={1} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#sticky-pin-fade)" />
    </Svg>
  );
}

const fadeStyles = RNStyleSheet.create({
  // Stops at the padding box, so the rule under the line stays solid.
  fade: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
  },
});
