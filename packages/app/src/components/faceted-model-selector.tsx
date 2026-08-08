import { useCallback, useMemo } from "react";
import { Pressable, Text, View, type PressableStateCallbackType } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { Check } from "lucide-react-native";
import type { SheetHeader } from "@/components/adaptive-modal-sheet";
import { SegmentedControl, type SegmentedControlOption } from "@/components/ui/segmented-control";
import {
  FACET_ORDER,
  facetTabLabel,
  type FacetedModelSelectorState,
} from "@/access-model/faceted-model-selector-state";
import type { FacetKey } from "@/access-model/facet-selection";
import { ICON_SIZE, type Theme } from "@/styles/theme";

export { useFacetedModelSelector } from "@/access-model/faceted-model-selector-state";
export type { FacetedModelSelectorState } from "@/access-model/faceted-model-selector-state";

const ThemedCheck = withUnistyles(Check);
const foregroundMutedMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

export function buildFacetedModelSelectorHeader(state: FacetedModelSelectorState): SheetHeader {
  return {
    title: state.title,
    subtitle: <FacetTabBar activeFacet={state.activeFacet} onChange={state.setActiveFacet} />,
  };
}

function FacetTabBar({
  activeFacet,
  onChange,
}: {
  activeFacet: FacetKey;
  onChange: (facet: FacetKey) => void;
}) {
  const options: SegmentedControlOption<FacetKey>[] = useMemo(
    () =>
      FACET_ORDER.map((facet) => ({
        value: facet,
        label: facetTabLabel(facet),
        testID: `faceted-model-selector-tab-${facet}`,
      })),
    [],
  );
  return (
    <SegmentedControl
      options={options}
      value={activeFacet}
      onValueChange={onChange}
      size="sm"
      testID="faceted-model-selector-tabs"
    />
  );
}

function FacetOptionRow({
  label,
  value,
  selected,
  facet,
  onSelect,
}: {
  label: string;
  value: string;
  selected: boolean;
  facet: FacetKey;
  onSelect: (facet: FacetKey, value: string) => void;
}) {
  const pressableStyle = useCallback(
    ({ hovered, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.row,
      Boolean(hovered) && styles.rowHovered,
      pressed && styles.rowPressed,
    ],
    [],
  );
  const accessibilityState = useMemo(() => ({ selected }), [selected]);
  const handlePress = useCallback(() => {
    onSelect(facet, value);
  }, [facet, onSelect, value]);
  return (
    <Pressable
      style={pressableStyle}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityState={accessibilityState}
      testID={`faceted-model-selector-option-${facet}-${value}`}
    >
      <Text style={styles.rowLabel} numberOfLines={1}>
        {label}
      </Text>
      {selected ? <ThemedCheck size={ICON_SIZE.sm} uniProps={foregroundMutedMapping} /> : null}
    </Pressable>
  );
}

export function FacetedModelSelectorBody({ state }: { state: FacetedModelSelectorState }) {
  if (state.optionsForActiveFacet.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No compatible options for the current selection.</Text>
      </View>
    );
  }
  return (
    <View>
      {state.optionsForActiveFacet.map((option) => (
        <FacetOptionRow
          key={option.value}
          label={option.label}
          value={option.value}
          selected={option.selected}
          facet={state.activeFacet}
          onSelect={state.selectFacetValue}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    minHeight: 40,
  },
  rowHovered: {
    backgroundColor: theme.colors.surface2,
  },
  rowPressed: {
    backgroundColor: theme.colors.surface3,
  },
  rowLabel: {
    flexShrink: 1,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  empty: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[6],
    alignItems: "center",
  },
  emptyText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    textAlign: "center",
  },
}));
