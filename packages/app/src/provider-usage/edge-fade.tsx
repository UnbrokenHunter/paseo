import { useCallback, useMemo, useState, type ReactNode } from "react";
import { type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native";
import MaskedView from "@react-native-masked-view/masked-view";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

export const EDGE_FADE_WIDTH = 12;

/**
 * Fades content out at its left and right edges instead of cutting it off.
 *
 * Native uses the same fixed-width fade as the CSS mask in the web build. The
 * MaskedView remains mounted whether or not the fade is active, so measuring an
 * overflowing label does not replace its native view hierarchy mid-render.
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
  const [width, setWidth] = useState(0);
  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  }, []);
  const maskElement = useMemo(
    () => <EdgeFadeMask active={active && width > 0} width={width} />,
    [active, width],
  );

  return (
    <MaskedView style={style} onLayout={handleLayout} maskElement={maskElement}>
      {children}
    </MaskedView>
  );
}

function EdgeFadeMask({ active, width }: { active: boolean; width: number }) {
  if (!active) {
    return (
      <Svg width="100%" height="100%">
        <Rect width="100%" height="100%" fill="#000" />
      </Svg>
    );
  }

  const edgeRatio = Math.min(EDGE_FADE_WIDTH, width / 2) / width;
  return (
    <Svg width="100%" height="100%" preserveAspectRatio="none">
      <Defs>
        <LinearGradient id="usage-edge-fade" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#000" stopOpacity={0} />
          <Stop offset={edgeRatio} stopColor="#000" stopOpacity={1} />
          <Stop offset={1 - edgeRatio} stopColor="#000" stopOpacity={1} />
          <Stop offset="1" stopColor="#000" stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#usage-edge-fade)" />
    </Svg>
  );
}
