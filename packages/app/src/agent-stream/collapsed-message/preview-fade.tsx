import type { ReactNode } from "react";
import { StyleSheet as RNStyleSheet, type StyleProp, type ViewStyle } from "react-native";
import MaskedView from "@react-native-masked-view/masked-view";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

export const PREVIEW_FADE_RIGHT = 32;
export const PREVIEW_FADE_BOTTOM = 20;

/**
 * Fades the clipped preview out at its right and bottom edges so the content
 * looks cut off on purpose rather than chopped.
 *
 * The two axes are two nested masks: a mask element composites source-over, so
 * one Svg holding both gradients would union them (everything opaque) instead
 * of intersecting them. The web build uses CSS masks with an explicit intersect
 * composite — see preview-fade.web.tsx.
 */
export function CollapsedPreviewFade({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <MaskedView style={style} maskElement={RIGHT_MASK_ELEMENT}>
      <MaskedView style={RNStyleSheet.absoluteFill} maskElement={BOTTOM_MASK_ELEMENT}>
        {children}
      </MaskedView>
    </MaskedView>
  );
}

function RightFadeMask() {
  return (
    <Svg width="100%" height="100%" preserveAspectRatio="none">
      <Defs>
        <LinearGradient id="collapsed-preview-fade-right" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#000" stopOpacity={1} />
          <Stop offset="0.8" stopColor="#000" stopOpacity={1} />
          <Stop offset="1" stopColor="#000" stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#collapsed-preview-fade-right)" />
    </Svg>
  );
}

function BottomFadeMask() {
  return (
    <Svg width="100%" height="100%" preserveAspectRatio="none">
      <Defs>
        <LinearGradient id="collapsed-preview-fade-bottom" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#000" stopOpacity={1} />
          <Stop offset="0.7" stopColor="#000" stopOpacity={1} />
          <Stop offset="1" stopColor="#000" stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#collapsed-preview-fade-bottom)" />
    </Svg>
  );
}

const RIGHT_MASK_ELEMENT = <RightFadeMask />;
const BOTTOM_MASK_ELEMENT = <BottomFadeMask />;
