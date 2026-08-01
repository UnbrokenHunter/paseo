import type { ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import MaskedView from "@react-native-masked-view/masked-view";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

export const EDGE_FADE_WIDTH = 12;

/**
 * Fades content out at its left and right edges instead of cutting it off.
 *
 * Native masks with an SVG gradient through MaskedView; the web build swaps in a CSS
 * mask (see edge-fade.web.tsx). A gradient overlay would be the simpler trick but it
 * cannot work here — it would have to be painted in the parent's background colour,
 * and the usage pill sits on a translucent tint over an unknown surface.
 */
export function EdgeFade({
  active,
  children,
  style,
}: {
  active: boolean;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  if (!active) {
    return <View style={style}>{children}</View>;
  }
  return (
    <MaskedView style={style} maskElement={MASK_ELEMENT}>
      {children}
    </MaskedView>
  );
}

function EdgeFadeMask() {
  return (
    <Svg width="100%" height="100%" preserveAspectRatio="none">
      <Defs>
        <LinearGradient id="usage-edge-fade" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#000" stopOpacity={0} />
          <Stop offset="0.12" stopColor="#000" stopOpacity={1} />
          <Stop offset="0.88" stopColor="#000" stopOpacity={1} />
          <Stop offset="1" stopColor="#000" stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#usage-edge-fade)" />
    </Svg>
  );
}

const MASK_ELEMENT = <EdgeFadeMask />;
