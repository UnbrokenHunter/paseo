import { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet as RNStyleSheet, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { EdgeFade } from "./edge-fade";

/** Reading pace, not attention-grabbing pace. */
const SPEED_PX_PER_SECOND = 22;
/** Blank run between the end of one pass and the start of the next. */
const GAP_PX = 40;
/** Ignore sub-pixel overflow, which would otherwise scroll a label that already fits. */
const OVERFLOW_EPSILON = 1;

/**
 * A single line that scrolls itself when it does not fit.
 *
 * Measuring the natural width is the whole problem here. A `Text` laid out inside a
 * bounded row measures against the space it was given, so it reports the truncated
 * width and never looks like it overflows — and `onTextLayout`, the API that would
 * report the real line width, is not implemented by react-native-web. So the label is
 * rendered in an invisible copy that sizes the box (and gets clamped by whatever
 * max-width the parent imposes), with a horizontal ScrollView laid over it: ScrollView
 * content is measured unbounded along its scroll axis on every platform.
 *
 * The scroll is a ticker, not a back-and-forth: a second copy follows the first a gap
 * behind, and the track resets the instant that second copy reaches the first one's
 * starting point, so the loop has no seam and the text always reads left to right.
 */
export function UsageMarquee({
  label,
  textStyle,
  fadeStyle,
  testID,
}: {
  label: string;
  textStyle: React.ComponentProps<typeof Text>["style"];
  fadeStyle: React.ComponentProps<typeof Animated.View>["style"];
  /** Lands on the visible copy only, so tests never match the invisible sizer. */
  testID?: string;
}) {
  const [viewportWidth, setViewportWidth] = useState(0);
  const [labelWidth, setLabelWidth] = useState(0);
  const scrolling =
    viewportWidth > 0 && labelWidth > 0 && labelWidth - viewportWidth > OVERFLOW_EPSILON;
  const cycleWidth = labelWidth + GAP_PX;

  const translate = useSharedValue(0);
  useEffect(() => {
    if (!scrolling) {
      translate.value = 0;
      return;
    }
    translate.value = 0;
    translate.value = withRepeat(
      withTiming(-cycleWidth, {
        duration: (cycleWidth / SPEED_PX_PER_SECOND) * 1000,
        easing: Easing.linear,
      }),
      -1,
      false,
    );
  }, [scrolling, cycleWidth, translate]);

  const marqueeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translate.value }],
  }));

  const handleViewportLayout = useCallback(
    (event: { nativeEvent: { layout: { width: number } } }) => {
      setViewportWidth(event.nativeEvent.layout.width);
    },
    [],
  );

  const handleLabelLayout = useCallback((event: { nativeEvent: { layout: { width: number } } }) => {
    setLabelWidth(event.nativeEvent.layout.width);
  }, []);

  return (
    <EdgeFade active={scrolling} style={styles.viewport}>
      <View
        style={styles.viewportInner}
        onLayout={handleViewportLayout}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {/* Sizes the box. Invisible, but still the thing the parent measures. */}
        <Text style={[textStyle, styles.sizer]} numberOfLines={1}>
          {label}
        </Text>
        <ScrollView
          horizontal
          scrollEnabled={false}
          showsHorizontalScrollIndicator={false}
          style={RNStyleSheet.absoluteFill}
          contentContainerStyle={styles.track}
          pointerEvents="none"
        >
          <Animated.View style={[styles.run, fadeStyle, scrolling ? marqueeStyle : undefined]}>
            <Text style={textStyle} numberOfLines={1} onLayout={handleLabelLayout} testID={testID}>
              {label}
            </Text>
            {scrolling ? (
              <>
                <View style={styles.gap} />
                <Text style={textStyle} numberOfLines={1}>
                  {label}
                </Text>
              </>
            ) : null}
          </Animated.View>
        </ScrollView>
      </View>
    </EdgeFade>
  );
}

const styles = StyleSheet.create(() => ({
  viewport: {
    flexShrink: 1,
  },
  viewportInner: {
    justifyContent: "center",
    overflow: "hidden",
  },
  sizer: {
    opacity: 0,
  },
  track: {
    alignItems: "center",
  },
  run: {
    flexDirection: "row",
    alignItems: "center",
  },
  gap: {
    width: GAP_PX,
  },
}));
