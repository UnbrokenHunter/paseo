import { useMemo, type ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";

export const PREVIEW_FADE_RIGHT = 32;
export const PREVIEW_FADE_BOTTOM = 20;

const RIGHT_MASK = `linear-gradient(90deg, #000 0, #000 calc(100% - ${PREVIEW_FADE_RIGHT}px), transparent 100%)`;
const BOTTOM_MASK = `linear-gradient(180deg, #000 0, #000 calc(100% - ${PREVIEW_FADE_BOTTOM}px), transparent 100%)`;
const MASK = `${RIGHT_MASK}, ${BOTTOM_MASK}`;

// Two mask layers default to a union; both edges must fade, so intersect them.
// `maskComposite: intersect` is the standard property and `source-in` is the
// -webkit- spelling of the same operation.
const MASK_STYLE = {
  WebkitMaskImage: MASK,
  maskImage: MASK,
  WebkitMaskComposite: "source-in",
  maskComposite: "intersect",
} as const;

/**
 * Fades the clipped preview out at its right and bottom edges so the content
 * looks cut off on purpose rather than chopped. Native masks with nested
 * MaskedViews instead — see preview-fade.tsx.
 */
export function CollapsedPreviewFade({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const maskStyle = useMemo(() => [style, MASK_STYLE], [style]);
  return <View style={maskStyle as StyleProp<ViewStyle>}>{children}</View>;
}
