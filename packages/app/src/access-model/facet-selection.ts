import type { AccessModelSnapshotPayload } from "./types";

/**
 * The four facets from issue #21's faceted selector: Family (Claude, GPT,
 * Gemini, ...), Access (a concrete account/entitlement, e.g. "Personal
 * Claude Pro"), Model (a canonical model), Agent (a runtime, e.g. Claude
 * Code). Deliberately mirrors AccessModelSnapshotPayload's vocabulary
 * rather than inventing new names.
 */
export type FacetKey = "family" | "access" | "model" | "agent";

export const FACET_KEYS: readonly FacetKey[] = ["family", "access", "model", "agent"];

/**
 * How a facet's current value was decided:
 * - explicit: the user picked it directly.
 * - inferred: derived from a fixed schema relationship to another explicit
 *   value (today: a canonical model's family), true regardless of what
 *   routes exist.
 * - forced: exactly one value remains for this facet given the current
 *   route universe and the other selected facets - a contingent fact about
 *   today's configuration, not a schema relationship.
 * - unselected: no value.
 */
export type FacetProvenance = "explicit" | "inferred" | "forced" | "unselected";

export interface FacetValues {
  family: string | null;
  access: string | null;
  model: string | null;
  agent: string | null;
}

export interface FacetSelectionState {
  values: FacetValues;
  provenance: Record<FacetKey, FacetProvenance>;
}

export const EMPTY_FACET_SELECTION: FacetSelectionState = {
  values: { family: null, access: null, model: null, agent: null },
  provenance: {
    family: "unselected",
    access: "unselected",
    model: "unselected",
    agent: "unselected",
  },
};

/**
 * One valid, currently-runnable combination, expanded from a Route through
 * its Binding and Entitlement so every facet's value is available without
 * re-joining the snapshot on every lookup. Access is the entitlement id,
 * not the account id - the issue's facet shows a concrete access choice
 * ("Personal Claude Pro"), and today's 1:1 account/entitlement derivation
 * (see server access-model/derive.ts) makes the two interchangeable, but
 * the facet should read from the level it will still be correct at once
 * entitlement dedup exists.
 */
export interface ExpandedRoute {
  route: AccessModelSnapshotPayload["routes"][number];
  family: string;
  access: string;
  model: string;
  agent: string;
}

/**
 * Every route that's actually runnable: its binding exists and is enabled,
 * its canonical model exists, and its account has an entitlement. A route
 * failing any of those is dropped rather than surfaced with a null facet
 * value - a hole in the domain data shouldn't produce an unselectable
 * "undefined" option in the UI.
 */
export function buildExpandedRoutes(
  snapshot: Pick<
    AccessModelSnapshotPayload,
    "routes" | "bindings" | "canonicalModels" | "entitlements"
  >,
): ExpandedRoute[] {
  const canonicalModelById = new Map(snapshot.canonicalModels.map((model) => [model.id, model]));
  const bindingById = new Map(snapshot.bindings.map((binding) => [binding.id, binding]));
  const entitlementByAccountId = new Map(
    snapshot.entitlements.map((entitlement) => [entitlement.accountId, entitlement]),
  );

  const expanded: ExpandedRoute[] = [];
  for (const route of snapshot.routes) {
    const binding = bindingById.get(route.bindingId);
    if (!binding || !binding.enabled) continue;
    const canonicalModel = canonicalModelById.get(route.canonicalModelId);
    if (!canonicalModel) continue;
    const entitlement = entitlementByAccountId.get(binding.accountId);
    if (!entitlement) continue;

    expanded.push({
      route,
      family: canonicalModel.familyId,
      access: entitlement.id,
      model: route.canonicalModelId,
      agent: binding.agentRuntimeId,
    });
  }
  return expanded;
}

function matchesAllExcept(
  expandedRoute: ExpandedRoute,
  values: FacetValues,
  except: FacetKey,
): boolean {
  for (const key of FACET_KEYS) {
    if (key === except) continue;
    const wanted = values[key];
    if (wanted !== null && expandedRoute[key] !== wanted) return false;
  }
  return true;
}

function matchesAll(expandedRoute: ExpandedRoute, values: FacetValues): boolean {
  return FACET_KEYS.every((key) => values[key] === null || expandedRoute[key] === values[key]);
}

/**
 * Distinct values a facet could still take given every other selected
 * facet, ignoring the facet's own current value - a facet's own selection
 * must never narrow its own option list, or the user could never see (or
 * revert to) sibling values.
 */
function availableValuesFor(
  expandedRoutes: readonly ExpandedRoute[],
  values: FacetValues,
  facet: FacetKey,
): string[] {
  const seen = new Set<string>();
  for (const expandedRoute of expandedRoutes) {
    if (matchesAllExcept(expandedRoute, values, facet)) {
      seen.add(expandedRoute[facet]);
    }
  }
  return [...seen];
}

function isCompatible(
  expandedRoutes: readonly ExpandedRoute[],
  values: FacetValues,
  facet: FacetKey,
): boolean {
  const value = values[facet];
  if (value === null) return true;
  return expandedRoutes.some(
    (expandedRoute) =>
      matchesAllExcept(expandedRoute, values, facet) && expandedRoute[facet] === value,
  );
}

function inferFamilyFromModel(
  values: FacetValues,
  provenance: Record<FacetKey, FacetProvenance>,
  canonicalModelById: Map<string, AccessModelSnapshotPayload["canonicalModels"][number]>,
  forcedFamily: boolean,
): boolean {
  if (values.family !== null || values.model === null) return false;
  const family = canonicalModelById.get(values.model)?.familyId;
  if (family === undefined) return false;
  values.family = family;
  provenance.family = forcedFamily ? "forced" : "inferred";
  return true;
}

/**
 * Applies one explicit facet change (a pick, or a clear when value is
 * null) and returns the new state: the newest explicit choice always wins;
 * every other explicit selection that's still reachable is preserved;
 * anything no longer reachable is cleared; and any facet left with exactly
 * one possible value is forced. See issue #21 "Selection semantics" -
 * this is the one implementation of that rule; nothing else may
 * special-case facet compatibility.
 */
export function applyFacetSelection(input: {
  expandedRoutes: readonly ExpandedRoute[];
  canonicalModels: AccessModelSnapshotPayload["canonicalModels"];
  previous: FacetSelectionState;
  facet: FacetKey;
  value: string | null;
}): FacetSelectionState {
  const { expandedRoutes, previous, facet, value } = input;
  const canonicalModelById = new Map(input.canonicalModels.map((model) => [model.id, model]));

  const values: FacetValues = { family: null, access: null, model: null, agent: null };
  const provenance: Record<FacetKey, FacetProvenance> = {
    family: "unselected",
    access: "unselected",
    model: "unselected",
    agent: "unselected",
  };
  for (const key of FACET_KEYS) {
    if (previous.provenance[key] === "explicit") {
      values[key] = previous.values[key];
      provenance[key] = "explicit";
    }
  }
  values[facet] = value;
  provenance[facet] = value === null ? "unselected" : "explicit";

  inferFamilyFromModel(values, provenance, canonicalModelById, false);

  // Drop explicit/inferred values no longer reachable given the rest of the
  // selection. Iterates to a fixed point: dropping one facet can make a
  // previously-compatible sibling incompatible in turn.
  let settled = false;
  while (!settled) {
    settled = true;
    for (const key of FACET_KEYS) {
      if (values[key] === null) continue;
      if (provenance[key] !== "explicit" && provenance[key] !== "inferred") continue;
      if (!isCompatible(expandedRoutes, values, key)) {
        values[key] = null;
        provenance[key] = "unselected";
        settled = false;
      }
    }
  }

  // Force any facet with exactly one remaining option, re-deriving the
  // model->family inference as forcing settles new values.
  settled = false;
  while (!settled) {
    settled = true;
    for (const key of FACET_KEYS) {
      if (values[key] !== null) continue;
      const options = availableValuesFor(expandedRoutes, values, key);
      if (options.length === 1 && options[0] !== undefined) {
        values[key] = options[0];
        provenance[key] = "forced";
        settled = false;
      }
    }
    if (
      inferFamilyFromModel(values, provenance, canonicalModelById, provenance.model === "forced")
    ) {
      settled = false;
    }
  }

  return { values, provenance };
}

export interface ResolvedFacetSelector {
  availableFamilies: string[];
  availableAccess: string[];
  availableModels: string[];
  availableAgents: string[];
  remainingRoutes: ExpandedRoute[];
  /** True when the current selection resolves to exactly one runnable route. */
  launchable: boolean;
  resolvedBindingId: string | null;
  resolvedRuntimeModelId: string | null;
}

/**
 * Read-only view over a selection state: what each facet could still
 * become, and whether the current selection already resolves to one
 * runnable binding + runtime model id (the contract the rest of Paseo's
 * agent/session machinery consumes - see docs/providers.md).
 */
export function resolveFacetSelector(
  expandedRoutes: readonly ExpandedRoute[],
  state: FacetSelectionState,
): ResolvedFacetSelector {
  const remainingRoutes = expandedRoutes.filter((expandedRoute) =>
    matchesAll(expandedRoute, state.values),
  );
  const uniqueBindingModelIds = new Set(
    remainingRoutes.map(
      (expandedRoute) => `${expandedRoute.route.bindingId}::${expandedRoute.route.modelId}`,
    ),
  );
  const launchable = remainingRoutes.length > 0 && uniqueBindingModelIds.size === 1;
  const resolvedRoute = launchable ? remainingRoutes[0]?.route : undefined;

  return {
    availableFamilies: availableValuesFor(expandedRoutes, state.values, "family"),
    availableAccess: availableValuesFor(expandedRoutes, state.values, "access"),
    availableModels: availableValuesFor(expandedRoutes, state.values, "model"),
    availableAgents: availableValuesFor(expandedRoutes, state.values, "agent"),
    remainingRoutes,
    launchable,
    resolvedBindingId: resolvedRoute?.bindingId ?? null,
    resolvedRuntimeModelId: resolvedRoute?.modelId ?? null,
  };
}
