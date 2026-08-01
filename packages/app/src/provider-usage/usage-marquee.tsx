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

const SPEED_MS_PER_PX = 16;
/** Ignore sub-pixel overflow, which would otherwise start a marquee that never moves. */
const OVERFLOW_EPSILON = 1;

/**
 * A single line that scrolls itself when it does not fit.
 *
 * Measuring the natural width is the whole problem here. A `Text` laid out inside a
 * bounded row measures against the space it was given, so it reports the truncated
 * width and never looks like it overflows — and `onTextLayout`, the API that would
 * report the real line width, is not implemented by react-native-web. So the label is
 * rendered twice: an invisible copy sizes the box (and gets clamped by whatever
 * max-width the parent imposes), and a horizontal ScrollView laid over it reports the
 * true content width, because ScrollView content is measured unbounded along its
 * scroll axis on every platform.
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
  const [contentWidth, setContentWidth] = useState(0);
  const overflow = contentWidth - viewportWidth;
  const scrolling = viewportWidth > 0 && overflow > OVERFLOW_EPSILON;

  const translate = useSharedValue(0);
  useEffect(() => {
    if (!scrolling) {
      translate.value = 0;
      return;
    }
    translate.value = 0;
    translate.value = withRepeat(
      withTiming(-overflow, {
        duration: overflow * SPEED_MS_PER_PX,
        easing: Easing.linear,
      }),
      -1,
      true,
    );
  }, [scrolling, overflow, translate]);

  const marqueeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translate.value }],
  }));

  const handleViewportLayout = useCallback(
    (event: { nativeEvent: { layout: { width: number } } }) => {
      setViewportWidth(event.nativeEvent.layout.width);
    },
    [],
  );

  const handleContentSize = useCallback((width: number) => {
    setContentWidth(width);
  }, []);

  return (
    <View
      style={styles.viewport}
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
        onContentSizeChange={handleContentSize}
        pointerEvents="none"
      >
        <Animated.View style={[fadeStyle, scrolling ? marqueeStyle : undefined]}>
          <Text style={textStyle} numberOfLines={1} testID={testID}>
            {label}
          </Text>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create(() => ({
  viewport: {
    flexShrink: 1,
    justifyContent: "center",
    overflow: "hidden",
  },
  sizer: {
    opacity: 0,
  },
  track: {
    alignItems: "center",
  },
}));
