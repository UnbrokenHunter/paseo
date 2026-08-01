import { useMemo, type ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";

export const EDGE_FADE_WIDTH = 12;

const MASK = `linear-gradient(90deg, transparent 0, #000 ${EDGE_FADE_WIDTH}px, #000 calc(100% - ${EDGE_FADE_WIDTH}px), transparent 100%)`;

/**
 * Fades content out at its left and right edges instead of cutting it off. The web
 * build uses a CSS mask; native masks with an SVG gradient (see edge-fade.tsx).
 * react-native-web passes `WebkitMaskImage` through to the DOM node, which is the same
 * route the splash-screen shimmer takes.
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
  const maskStyle = useMemo(
    () => (active ? [style, { WebkitMaskImage: MASK, maskImage: MASK }] : style),
    [active, style],
  );
  return <View style={maskStyle as StyleProp<ViewStyle>}>{children}</View>;
}
