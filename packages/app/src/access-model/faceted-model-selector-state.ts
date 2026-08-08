import { useCallback, useMemo, useState } from "react";
import { i18n } from "@/i18n/i18next";
import {
  applyFacetSelection,
  buildExpandedRoutes,
  EMPTY_FACET_SELECTION,
  FACET_KEYS,
  resolveFacetSelector,
  type FacetKey,
  type FacetSelectionState,
} from "./facet-selection";
import type { AccessModelSnapshotPayload } from "./types";

/**
 * Labels for whatever facet id the resolver hands back. The resolver only
 * knows ids (it's pure domain logic over the snapshot); this is the one
 * place that turns an id into what a user reads.
 */
export function buildFacetLabels(snapshot: AccessModelSnapshotPayload | null) {
  return {
    family: new Map((snapshot?.modelFamilies ?? []).map((entry) => [entry.id, entry.label])),
    access: new Map((snapshot?.entitlements ?? []).map((entry) => [entry.id, entry.label])),
    model: new Map((snapshot?.canonicalModels ?? []).map((entry) => [entry.id, entry.label])),
    agent: new Map((snapshot?.agentRuntimes ?? []).map((entry) => [entry.id, entry.label])),
  };
}

export type FacetLabels = ReturnType<typeof buildFacetLabels>;

export const FACET_ORDER: readonly FacetKey[] = FACET_KEYS;

export function facetTabLabel(facet: FacetKey): string {
  return i18n.t(`settings.agentRuntimes.modelRouting.facets.${facet}`);
}

function nextUnresolvedFacet(state: FacetSelectionState, from: FacetKey): FacetKey | null {
  const startIndex = FACET_ORDER.indexOf(from);
  for (let offset = 1; offset <= FACET_ORDER.length; offset += 1) {
    const candidate = FACET_ORDER[(startIndex + offset) % FACET_ORDER.length];
    if (candidate && state.values[candidate] === null) {
      return candidate;
    }
  }
  return null;
}

export function summaryTitle(state: FacetSelectionState, labels: FacetLabels): string {
  const parts = FACET_ORDER.map((facet) => {
    const value = state.values[facet];
    if (value === null) return null;
    return labels[facet].get(value) ?? value;
  }).filter((part): part is string => part !== null);
  return parts.length > 0
    ? parts.join(" · ")
    : i18n.t("settings.agentRuntimes.modelRouting.selectModel");
}

export interface FacetOption {
  value: string;
  label: string;
  selected: boolean;
}

export interface FacetedModelSelectorState {
  snapshot: AccessModelSnapshotPayload | null;
  selection: FacetSelectionState;
  activeFacet: FacetKey;
  labels: FacetLabels;
  title: string;
  launchable: boolean;
  resolvedBindingId: string | null;
  resolvedRuntimeModelId: string | null;
  setActiveFacet: (facet: FacetKey) => void;
  selectFacetValue: (facet: FacetKey, value: string) => void;
  optionsForActiveFacet: FacetOption[];
}

export function useFacetedModelSelector(input: {
  snapshot: AccessModelSnapshotPayload | null;
}): FacetedModelSelectorState {
  const [selection, setSelection] = useState<FacetSelectionState>(EMPTY_FACET_SELECTION);
  const [activeFacet, setActiveFacetState] = useState<FacetKey>("family");

  const expandedRoutes = useMemo(
    () => (input.snapshot ? buildExpandedRoutes(input.snapshot) : []),
    [input.snapshot],
  );
  const canonicalModels = useMemo(() => input.snapshot?.canonicalModels ?? [], [input.snapshot]);
  const labels = useMemo(() => buildFacetLabels(input.snapshot), [input.snapshot]);

  const resolved = useMemo(
    () => resolveFacetSelector(expandedRoutes, selection),
    [expandedRoutes, selection],
  );

  const setActiveFacet = useCallback((facet: FacetKey) => {
    setActiveFacetState(facet);
  }, []);

  const selectFacetValue = useCallback(
    (facet: FacetKey, value: string) => {
      const next = applyFacetSelection({
        expandedRoutes,
        canonicalModels,
        previous: selection,
        facet,
        value,
      });
      setSelection(next);
      const advanceTo = nextUnresolvedFacet(next, facet);
      if (advanceTo) {
        setActiveFacetState(advanceTo);
      }
    },
    [canonicalModels, expandedRoutes, selection],
  );

  const optionsForActiveFacet = useMemo(() => {
    const availableByFacet: Record<FacetKey, string[]> = {
      family: resolved.availableFamilies,
      access: resolved.availableAccess,
      model: resolved.availableModels,
      agent: resolved.availableAgents,
    };
    return availableByFacet[activeFacet].map((value) => ({
      value,
      label: labels[activeFacet].get(value) ?? value,
      selected: selection.values[activeFacet] === value,
    }));
  }, [resolved, activeFacet, labels, selection.values]);

  return {
    snapshot: input.snapshot,
    selection,
    activeFacet,
    labels,
    title: summaryTitle(selection, labels),
    launchable: resolved.launchable,
    resolvedBindingId: resolved.resolvedBindingId,
    resolvedRuntimeModelId: resolved.resolvedRuntimeModelId,
    setActiveFacet,
    selectFacetValue,
    optionsForActiveFacet,
  };
}
