import {
  Fragment,
  type ReactElement,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  FlatList,
  Keyboard,
  Platform,
  View,
  type LayoutChangeEvent,
  type ListRenderItemInfo,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ViewStyle,
  type ViewToken,
} from "react-native";
import { withUnistyles } from "react-native-unistyles";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import type { StreamItem } from "@/types/stream";
import type { Theme } from "@/styles/theme";
import { useStableEvent } from "@/hooks/use-stable-event";
import { useBottomAnchorController } from "./bottom-anchor-controller";
import { useScrollKeyboardDismiss } from "./scroll-keyboard-dismiss/use-scroll-keyboard-dismiss";
import type { StreamRenderInput, StreamStrategy, StreamViewportHandle } from "./strategy";
import {
  createStreamStrategy,
  isNearBottomForStreamRenderStrategy,
  resolveBottomAnchorTransportBehavior,
} from "./strategy";
import {
  createHistoryStartPaginationState,
  evaluateHistoryStartPagination,
  rearmHistoryStartPagination,
} from "./history-start-pagination";
import { isStickyPreviewTrackedItem } from "./sticky-header/model";

const DEFAULT_MAINTAIN_VISIBLE_CONTENT_POSITION = Object.freeze({
  minIndexForVisible: 0,
  autoscrollToTopThreshold: 0,
});

const ThemedLoadingSpinner = withUnistyles(LoadingSpinner);
const foregroundMutedColorMapping = (theme: Theme) => ({
  color: theme.colors.foregroundMuted,
});
const historyStartSlotStyle: ViewStyle = {
  alignItems: "center",
  justifyContent: "center",
  minHeight: 32,
  paddingTop: 4,
  paddingBottom: 8,
};
interface HistoryRowDisplayVariants {
  regular?: StreamItem;
  compact?: StreamItem;
}

const historyRowDisplayVariants = new WeakMap<StreamItem, HistoryRowDisplayVariants>();

function getHistoryRowDisplayVariant(item: StreamItem, compact: boolean): StreamItem {
  let variants = historyRowDisplayVariants.get(item);
  if (!variants) {
    variants = {};
    historyRowDisplayVariants.set(item, variants);
  }
  const key = compact ? "compact" : "regular";
  variants[key] ??= { ...item };
  return variants[key];
}

function keyExtractor(item: { id: string }): string {
  return item.id;
}

// Any sliver of a row on screen keeps it out of the sticky header.
const STICKY_VIEWABILITY_CONFIG = { itemVisiblePercentThreshold: 0 };

interface LiveHeadRowMetric {
  itemId: string;
  top: number;
  bottom: number;
}

interface LiveHeadRowSlotProps {
  itemId: string;
  onMeasure: (metric: LiveHeadRowMetric) => void;
  children: ReactNode;
}

function LiveHeadRowSlot({ itemId, onMeasure, children }: LiveHeadRowSlotProps) {
  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const { y, height } = event.nativeEvent.layout;
      onMeasure({ itemId, top: y, bottom: y + height });
    },
    [itemId, onMeasure],
  );
  return <View onLayout={handleLayout}>{children}</View>;
}

function NativeStreamViewport(props: StreamRenderInput & { strategy: StreamStrategy }) {
  const {
    agentId,
    segments,
    historyRowRevision,
    liveHeadRowRevision,
    boundary,
    renderers,
    listEmptyComponent,
    viewportRef,
    routeBottomAnchorRequest,
    isAuthoritativeHistoryReady,
    onNearBottomChange,
    onNearHistoryStart,
    isLoadingOlderHistory,
    hasOlderHistory,
    olderHistoryProgressKey,
    scrollEnabled,
    stickyPreviewEnabled,
    onAboveViewportItemChange,
    stickyFoldOffset,
    listStyle,
    baseListContentContainerStyle,
    strategy,
  } = props;
  const { renderHistoryMountedRow, renderLiveHeadRow, renderLiveAuxiliary } = renderers;
  const flatListRef = useRef<FlatList<StreamItem>>(null);
  const streamViewportMetricsRef = useRef({
    containerKey: "native-virtualized",
    contentHeight: 0,
    viewportWidth: 0,
    viewportHeight: 0,
    offsetY: 0,
    viewportMeasuredForKey: null as string | null,
    contentMeasuredForKey: null as string | null,
  });
  const scrollOffsetYRef = useRef(0);
  const isUserScrollActiveRef = useRef(false);
  const scrollKeyboardDismiss = useScrollKeyboardDismiss();
  const userScrollEndFrameIdRef = useRef<number | null>(null);
  const programmaticScrollEventBudgetRef = useRef(0);
  const [isNativeViewportSettling, setIsNativeViewportSettling] = useState(false);
  const nativeViewportSettlingFrameIdRef = useRef<number | null>(null);
  const historyStartReadyRef = useRef(false);
  const historyStartPaginationStateRef = useRef(createHistoryStartPaginationState());
  // Highest viewable row index. The list is inverted, so anything above it in
  // index space has scrolled off the top edge. -1 once the header alone fills
  // the viewport; null until viewability has reported at least once.
  const maxViewableHistoryIndexRef = useRef<number | null>(null);
  const liveHeadHeightRef = useRef(0);
  const liveHeadRowMetricsRef = useRef(new Map<string, LiveHeadRowMetric>());

  const historyItems = useMemo(() => {
    if (segments.historyVirtualized.length === 0) {
      return segments.historyMounted;
    }
    return [...segments.historyVirtualized, ...segments.historyMounted];
  }, [segments.historyMounted, segments.historyVirtualized]);
  // Keep unchanged item identities intact so live updates only rerender rows
  // whose projected content or local display state actually changed. A rare
  // breakpoint change intentionally refreshes the whole history window.
  const globallyRevisedHistoryRows = useMemo(() => {
    const globalDisplayState = historyRowRevision?.globalDisplayState ?? false;
    return historyItems.map((item) => getHistoryRowDisplayVariant(item, globalDisplayState));
  }, [historyItems, historyRowRevision?.globalDisplayState]);
  const displayStateHistoryRows = useMemo(
    () =>
      globallyRevisedHistoryRows.map((item) =>
        historyRowRevision?.displayStateById.has(item.id) ? { ...item } : item,
      ),
    [globallyRevisedHistoryRows, historyRowRevision?.displayStateById],
  );
  const historyRows = useMemo(
    () =>
      displayStateHistoryRows.map((item) =>
        historyRowRevision?.contentById.has(item.id) ? { ...item } : item,
      ),
    [displayStateHistoryRows, historyRowRevision?.contentById],
  );
  const evaluateHistoryStart = useStableEvent(() => {
    const metrics = streamViewportMetricsRef.current;
    const hasMeasuredViewport =
      metrics.viewportMeasuredForKey === metrics.containerKey &&
      metrics.contentMeasuredForKey === metrics.containerKey;
    const result = evaluateHistoryStartPagination(historyStartPaginationStateRef.current, {
      distanceFromHistoryStart: metrics.contentHeight - metrics.viewportHeight - metrics.offsetY,
      hasOlderHistory,
      isLoadingOlderHistory,
      isReady: historyStartReadyRef.current && hasMeasuredViewport,
      progressKey: olderHistoryProgressKey,
    });
    historyStartPaginationStateRef.current = result.state;
    if (result.shouldLoad) {
      onNearHistoryStart();
    }
  });

  // The list is inverted, so the scroll offset measures distance from the bottom
  // of the content and the live head occupies content range [0, headerHeight].
  // RN composes the inversion transform onto the header wrapper as well as the
  // cells, so the header's own children lay out top-down and a child at local
  // [top, bottom] lands at content range [headerHeight - bottom, headerHeight - top].
  const updateAboveViewportItem = useStableEvent(() => {
    if (!stickyPreviewEnabled) {
      return;
    }
    const metrics = streamViewportMetricsRef.current;
    if (metrics.viewportHeight <= 0) {
      return;
    }
    // The fold is the bottom of the sticky block, not the viewport's own top
    // edge: the block covers that strip, so a message is gone once it is under
    // it. Content coordinates run up from the bottom here, so moving the fold
    // down the screen subtracts. Never deeper than what has actually scrolled
    // past, though — the block only exists once something is pinned, so an
    // unclamped offset would pin the first message of a conversation that has
    // not moved, and then cover it with the block that pinned it.
    const scrolledAbove = Math.max(
      metrics.contentHeight - metrics.viewportHeight - metrics.offsetY,
      0,
    );
    const viewportTop =
      metrics.offsetY + metrics.viewportHeight - Math.min(stickyFoldOffset, scrolledAbove);
    let boundaryItemId: string | null = null;

    const headerHeight = liveHeadHeightRef.current;
    if (headerHeight > 0) {
      // segments.liveHead is newest first, so the first match walking forward is
      // also the chronologically latest one that has started above the top edge.
      for (const item of segments.liveHead) {
        if (!isStickyPreviewTrackedItem(item)) {
          continue;
        }
        const metric = liveHeadRowMetricsRef.current.get(item.id);
        if (metric && headerHeight - metric.top >= viewportTop) {
          boundaryItemId = item.id;
          break;
        }
      }
    }

    if (boundaryItemId === null) {
      // The list is inverted, so the highest viewable index is the row nearest
      // the top edge — the one the reader is inside. Taking the row after it
      // would name the message they have already finished.
      const maxViewableIndex = maxViewableHistoryIndexRef.current;
      if (maxViewableIndex !== null) {
        for (let index = maxViewableIndex; index < historyItems.length; index += 1) {
          const item = historyItems[index];
          if (item && isStickyPreviewTrackedItem(item)) {
            boundaryItemId = item.id;
            break;
          }
        }
      }
    }

    onAboveViewportItemChange(boundaryItemId);
  });

  const handleViewableItemsChanged = useStableEvent(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      let maxViewableIndex = -1;
      for (const token of viewableItems) {
        if (token.index !== null && token.index > maxViewableIndex) {
          maxViewableIndex = token.index;
        }
      }
      maxViewableHistoryIndexRef.current = maxViewableIndex;
      updateAboveViewportItem();
    },
  );

  const handleLiveHeadLayout = useStableEvent((event: LayoutChangeEvent) => {
    liveHeadHeightRef.current = event.nativeEvent.layout.height;
    updateAboveViewportItem();
  });

  const handleLiveHeadRowMeasure = useStableEvent((metric: LiveHeadRowMetric) => {
    liveHeadRowMetricsRef.current.set(metric.itemId, metric);
    updateAboveViewportItem();
  });

  const clearNativeViewportSettling = useCallback(() => {
    if (nativeViewportSettlingFrameIdRef.current !== null) {
      cancelAnimationFrame(nativeViewportSettlingFrameIdRef.current);
      nativeViewportSettlingFrameIdRef.current = null;
    }
  }, []);

  const clearPendingUserScrollEnd = useCallback(() => {
    if (userScrollEndFrameIdRef.current !== null) {
      cancelAnimationFrame(userScrollEndFrameIdRef.current);
      userScrollEndFrameIdRef.current = null;
    }
  }, []);

  const markNativeViewportSettling = useCallback(() => {
    clearNativeViewportSettling();
    setIsNativeViewportSettling(true);
    let remainingFrames = 4;
    const tick = () => {
      if (remainingFrames <= 0) {
        nativeViewportSettlingFrameIdRef.current = null;
        setIsNativeViewportSettling(false);
        return;
      }
      remainingFrames -= 1;
      nativeViewportSettlingFrameIdRef.current = requestAnimationFrame(tick);
    };
    nativeViewportSettlingFrameIdRef.current = requestAnimationFrame(tick);
  }, [clearNativeViewportSettling]);

  const bottomAnchorTransportBehavior = useMemo(
    () =>
      resolveBottomAnchorTransportBehavior({
        strategy,
        isViewportSettling: isNativeViewportSettling,
      }),
    [isNativeViewportSettling, strategy],
  );

  const scrollToBottom = useCallback(
    (animated: boolean) => {
      programmaticScrollEventBudgetRef.current = 3;
      flatListRef.current?.scrollToOffset({
        offset: 0,
        animated,
      });
      scrollOffsetYRef.current = 0;
      streamViewportMetricsRef.current = {
        ...streamViewportMetricsRef.current,
        offsetY: 0,
      };
      onNearBottomChange(true);
    },
    [onNearBottomChange],
  );

  const bottomAnchorController = useBottomAnchorController({
    agentId,
    routeRequest: routeBottomAnchorRequest,
    isAuthoritativeHistoryReady,
    renderStrategy: "inverted-stream",
    transportBehavior: bottomAnchorTransportBehavior,
    getMeasurementState: () => streamViewportMetricsRef.current,
    isNearBottom: () => {
      const metrics = streamViewportMetricsRef.current;
      return isNearBottomForStreamRenderStrategy({
        strategy,
        offsetY: metrics.offsetY,
        threshold: 32,
        contentHeight: metrics.contentHeight,
        viewportHeight: metrics.viewportHeight,
      });
    },
    scrollToBottom,
  });
  // Android's maintainVisibleContentPosition ignores the list inversion transform and
  // fights the controller's offset-zero correction while the live header grows.
  const maintainVisibleContentPosition =
    Platform.OS === "android" && bottomAnchorController.mode === "sticky-bottom"
      ? undefined
      : DEFAULT_MAINTAIN_VISIBLE_CONTENT_POSITION;

  useEffect(() => {
    streamViewportMetricsRef.current = {
      containerKey: "native-virtualized",
      contentHeight: 0,
      viewportWidth: 0,
      viewportHeight: 0,
      offsetY: 0,
      viewportMeasuredForKey: null,
      contentMeasuredForKey: null,
    };
    scrollOffsetYRef.current = 0;
    isUserScrollActiveRef.current = false;
    clearPendingUserScrollEnd();
    clearNativeViewportSettling();
    setIsNativeViewportSettling(false);
    historyStartReadyRef.current = false;
    historyStartPaginationStateRef.current = createHistoryStartPaginationState();
    maxViewableHistoryIndexRef.current = null;
    liveHeadHeightRef.current = 0;
    liveHeadRowMetricsRef.current.clear();
    const frame = requestAnimationFrame(() => {
      historyStartReadyRef.current = true;
      evaluateHistoryStart();
    });
    return () => {
      cancelAnimationFrame(frame);
      clearPendingUserScrollEnd();
    };
  }, [agentId, clearNativeViewportSettling, clearPendingUserScrollEnd, evaluateHistoryStart]);

  useEffect(() => {
    const keyboardEvents = [
      "keyboardWillShow",
      "keyboardWillHide",
      "keyboardDidShow",
      "keyboardDidHide",
      "keyboardWillChangeFrame",
      "keyboardDidChangeFrame",
    ] as const;
    const subscriptions = keyboardEvents.map((eventName) =>
      Keyboard.addListener(eventName, () => {
        markNativeViewportSettling();
      }),
    );
    return () => {
      for (const subscription of subscriptions) {
        subscription.remove();
      }
      clearNativeViewportSettling();
    };
  }, [clearNativeViewportSettling, markNativeViewportSettling]);

  useEffect(() => {
    bottomAnchorController.prepareForStickyContentChange();
  }, [bottomAnchorController, historyRows, segments.liveHead]);

  // Rows above the viewport are usually outside the render window, so the index
  // scroll can fail; the retry runs once the list has widened its window.
  const pendingScrollToIndexRef = useRef<number | null>(null);
  const scrollToStreamItem = useStableEvent((itemId: string) => {
    const index = historyItems.findIndex((item) => item.id === itemId);
    if (index < 0) {
      // Live-head rows sit at the bottom of the conversation.
      bottomAnchorController.requestLocalAnchor({ agentId, reason: "jump-to-bottom" });
      return;
    }
    pendingScrollToIndexRef.current = index;
    flatListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 1 });
  });

  const handleScrollToIndexFailed = useStableEvent(
    (info: { index: number; averageItemLength: number }) => {
      flatListRef.current?.scrollToOffset({
        offset: info.index * info.averageItemLength,
        animated: false,
      });
      requestAnimationFrame(() => {
        if (pendingScrollToIndexRef.current !== info.index) {
          return;
        }
        pendingScrollToIndexRef.current = null;
        flatListRef.current?.scrollToIndex({
          index: info.index,
          animated: true,
          viewPosition: 1,
        });
      });
    },
  );

  useEffect(() => {
    const handle: StreamViewportHandle = {
      scrollToBottom: (reason = "jump-to-bottom") => {
        bottomAnchorController.requestLocalAnchor({
          agentId,
          reason,
        });
      },
      prepareForViewportChange: () => {
        bottomAnchorController.prepareForStickyViewportChange();
        markNativeViewportSettling();
      },
      scrollToItem: (itemId: string) => {
        scrollToStreamItem(itemId);
      },
    };
    viewportRef.current = handle;
    return () => {
      if (viewportRef.current === handle) {
        viewportRef.current = null;
      }
    };
  }, [
    agentId,
    bottomAnchorController,
    markNativeViewportSettling,
    scrollToStreamItem,
    viewportRef,
  ]);

  const isScrollEventNearBottom = useStableEvent(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
      return isNearBottomForStreamRenderStrategy({
        strategy,
        offsetY: contentOffset.y,
        threshold: 32,
        contentHeight: contentSize.height,
        viewportHeight: layoutMeasurement.height,
      });
    },
  );

  const handleScroll = useStableEvent((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const previousOffsetY = scrollOffsetYRef.current;
    scrollOffsetYRef.current = contentOffset.y;
    scrollKeyboardDismiss.onScroll(event);

    streamViewportMetricsRef.current = {
      contentHeight: Math.max(0, contentSize.height),
      viewportWidth: Math.max(0, layoutMeasurement.width),
      viewportHeight: Math.max(0, layoutMeasurement.height),
      containerKey: "native-virtualized",
      offsetY: contentOffset.y,
      viewportMeasuredForKey: "native-virtualized",
      contentMeasuredForKey: "native-virtualized",
    };

    const nearBottom = isScrollEventNearBottom(event);
    onNearBottomChange(nearBottom);

    evaluateHistoryStart();
    updateAboveViewportItem();

    if (
      !isUserScrollActiveRef.current &&
      programmaticScrollEventBudgetRef.current > 0 &&
      contentOffset.y <= 8
    ) {
      programmaticScrollEventBudgetRef.current -= 1;
    } else {
      programmaticScrollEventBudgetRef.current = 0;
      bottomAnchorController.handleScrollNearBottomChange({
        nextIsNearBottom: nearBottom,
        scrollDelta: contentOffset.y - previousOffsetY,
      });
    }
  });

  const handleScrollBeginDrag = useStableEvent((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!isLoadingOlderHistory) {
      historyStartPaginationStateRef.current = rearmHistoryStartPagination(
        historyStartPaginationStateRef.current,
      );
    }
    clearPendingUserScrollEnd();
    isUserScrollActiveRef.current = true;
    scrollKeyboardDismiss.onScrollBeginDrag(event);
    bottomAnchorController.beginUserScroll();
    evaluateHistoryStart();
  });

  // Defer drag end so momentum can take ownership, but capture the terminal
  // gesture position now because layout may move the viewport in the meantime.
  const handleScrollEndDrag = useStableEvent((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const isNearBottom = isScrollEventNearBottom(event);
    scrollKeyboardDismiss.onScrollEndDrag(event);

    clearPendingUserScrollEnd();
    userScrollEndFrameIdRef.current = requestAnimationFrame(() => {
      userScrollEndFrameIdRef.current = null;
      isUserScrollActiveRef.current = false;
      bottomAnchorController.endUserScroll({ isNearBottom });
    });
  });

  const handleMomentumScrollBegin = useStableEvent(() => {
    clearPendingUserScrollEnd();
  });

  const handleMomentumScrollEnd = useStableEvent(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      // Android can emit momentum-end after a programmatic anchor correction.
      // Only momentum that still owns the user gesture may settle scroll intent.
      if (!isUserScrollActiveRef.current) {
        return;
      }
      const isNearBottom = isScrollEventNearBottom(event);
      clearPendingUserScrollEnd();
      isUserScrollActiveRef.current = false;
      bottomAnchorController.endUserScroll({ isNearBottom });
    },
  );

  const handleListLayout = useStableEvent((event: LayoutChangeEvent) => {
    const previousViewportWidth = streamViewportMetricsRef.current.viewportWidth;
    const previousViewportHeight = streamViewportMetricsRef.current.viewportHeight;
    const viewportWidth = Math.max(0, event.nativeEvent.layout.width);
    const viewportHeight = Math.max(0, event.nativeEvent.layout.height);
    const viewportChanged =
      (previousViewportWidth > 0 && previousViewportWidth !== viewportWidth) ||
      (previousViewportHeight > 0 && previousViewportHeight !== viewportHeight);
    streamViewportMetricsRef.current = {
      ...streamViewportMetricsRef.current,
      containerKey: "native-virtualized",
      viewportWidth,
      viewportHeight,
      viewportMeasuredForKey: "native-virtualized",
    };
    if (viewportChanged) {
      markNativeViewportSettling();
    }
    bottomAnchorController.handleViewportMetricsChange({
      previousViewportWidth,
      viewportWidth,
      previousViewportHeight,
      viewportHeight,
    });
    evaluateHistoryStart();
    updateAboveViewportItem();
  });

  const handleContentSizeChange = useStableEvent((_width: number, height: number) => {
    const previousContentHeight = streamViewportMetricsRef.current.contentHeight;
    const nextContentHeight = Math.max(0, height);
    streamViewportMetricsRef.current = {
      ...streamViewportMetricsRef.current,
      containerKey: "native-virtualized",
      contentHeight: nextContentHeight,
      contentMeasuredForKey: "native-virtualized",
    };
    bottomAnchorController.handleContentSizeChange({
      previousContentHeight,
      contentHeight: nextContentHeight,
    });
    evaluateHistoryStart();
  });

  useEffect(() => {
    evaluateHistoryStart();
  }, [evaluateHistoryStart, hasOlderHistory, isLoadingOlderHistory, olderHistoryProgressKey]);

  useEffect(() => {
    updateAboveViewportItem();
  }, [stickyPreviewEnabled, updateAboveViewportItem]);

  // Drop measurements for live-head rows that have been committed to history.
  useEffect(() => {
    const metrics = liveHeadRowMetricsRef.current;
    if (metrics.size === 0) {
      return;
    }
    const liveIds = new Set(segments.liveHead.map((item) => item.id));
    for (const itemId of metrics.keys()) {
      if (!liveIds.has(itemId)) {
        metrics.delete(itemId);
      }
    }
  }, [segments.liveHead]);

  const renderItem = useStableEvent(
    ({ item, index }: ListRenderItemInfo<StreamItem>): ReactElement | null => {
      const rendered = renderHistoryMountedRow(item, index, historyItems);
      return (rendered ?? null) as ReactElement | null;
    },
  );

  const liveHeaderContent = useMemo(() => {
    // Stable render events read the latest expansion state; this revision makes
    // the memo invoke them again when that state changes.
    void liveHeadRowRevision;
    const liveHeadRows = segments.liveHead.map((item, index) => {
      const row = renderLiveHeadRow(item, index, segments.liveHead);
      if (!stickyPreviewEnabled || !isStickyPreviewTrackedItem(item)) {
        return <Fragment key={item.id}>{row}</Fragment>;
      }
      return (
        <LiveHeadRowSlot key={item.id} itemId={item.id} onMeasure={handleLiveHeadRowMeasure}>
          {row}
        </LiveHeadRowSlot>
      );
    });
    const liveAuxiliary = renderLiveAuxiliary();
    if (
      liveHeadRows.length === 0 &&
      !liveAuxiliary &&
      !boundary.hasMountedHistory &&
      !boundary.hasVirtualizedHistory
    ) {
      return (listEmptyComponent ?? null) as ReactElement | null;
    }
    if (!stickyPreviewEnabled) {
      return (
        <Fragment>
          {liveHeadRows}
          {liveAuxiliary}
        </Fragment>
      );
    }
    return (
      <View onLayout={handleLiveHeadLayout}>
        {liveHeadRows}
        {liveAuxiliary}
      </View>
    );
  }, [
    boundary,
    handleLiveHeadLayout,
    handleLiveHeadRowMeasure,
    listEmptyComponent,
    liveHeadRowRevision,
    renderLiveAuxiliary,
    renderLiveHeadRow,
    segments.liveHead,
    stickyPreviewEnabled,
  ]);

  const historyFooterContent = useMemo(() => {
    if (!hasOlderHistory && !isLoadingOlderHistory) {
      return null;
    }
    return (
      <View
        style={historyStartSlotStyle}
        testID={isLoadingOlderHistory ? "load-older-history-spinner" : undefined}
      >
        {isLoadingOlderHistory ? (
          <ThemedLoadingSpinner size="small" uniProps={foregroundMutedColorMapping} />
        ) : null}
      </View>
    );
  }, [hasOlderHistory, isLoadingOlderHistory]);

  // RN's FlatList strictMode keeps its internal renderItem wrapper stable when
  // data or the live header changes, preserving the row identities above.
  return (
    <FlatList
      ref={flatListRef}
      data={historyRows}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      strictMode
      testID="agent-chat-scroll"
      nativeID="agent-chat-scroll-native-virtualized"
      ListHeaderComponent={liveHeaderContent ?? undefined}
      ListFooterComponent={historyFooterContent ?? undefined}
      contentContainerStyle={baseListContentContainerStyle}
      style={listStyle}
      onLayout={handleListLayout}
      onScroll={handleScroll}
      onScrollBeginDrag={handleScrollBeginDrag}
      onScrollEndDrag={handleScrollEndDrag}
      onMomentumScrollBegin={handleMomentumScrollBegin}
      onMomentumScrollEnd={handleMomentumScrollEnd}
      scrollEventThrottle={16}
      onContentSizeChange={handleContentSizeChange}
      onViewableItemsChanged={handleViewableItemsChanged}
      viewabilityConfig={STICKY_VIEWABILITY_CONFIG}
      onScrollToIndexFailed={handleScrollToIndexFailed}
      maintainVisibleContentPosition={maintainVisibleContentPosition}
      initialNumToRender={40}
      maxToRenderPerBatch={40}
      updateCellsBatchingPeriod={0}
      windowSize={21}
      removeClippedSubviews={false}
      scrollEnabled={scrollEnabled}
      showsVerticalScrollIndicator
      inverted
    />
  );
}

export function createNativeStreamStrategy(): StreamStrategy {
  const strategy = createStreamStrategy({
    render: (renderInput) => <NativeStreamViewport {...renderInput} strategy={strategy} />,
    orderTailReverse: true,
    orderHeadReverse: true,
    assistantTurnTraversalStep: 1,
    edgeSlot: "header",
    historyLiveBoundaryEdge: "first",
    liveHeadHistoryBoundaryEdge: "last",
    frameChildOrder: "footer-then-content",
    flatListInverted: true,
    overlayScrollbarInverted: true,
    maintainVisibleContentPosition: DEFAULT_MAINTAIN_VISIBLE_CONTENT_POSITION,
    bottomAnchorTransportBehavior: {
      verificationDelayFrames: 2,
      verificationRetryMode: "recheck",
    },
    disableParentScrollOnInlineDetailsExpansion: false,
    anchorBottomOnContentSizeChange: false,
    animateManualScrollToBottom: true,
    useVirtualizedList: true,
    isNearBottom: (input) => input.offsetY <= input.threshold,
    getBottomOffset: () => 0,
  });
  return strategy;
}
