import { describe, expect, it } from "vitest";
import type { AccessModelSnapshotPayload } from "./types";
import {
  applyFacetSelection,
  buildExpandedRoutes,
  EMPTY_FACET_SELECTION,
  resolveFacetSelector,
  type FacetSelectionState,
} from "./facet-selection";

/**
 * Models issue #21's examples A/B/D in one fixture:
 * - Claude family: two canonical models (opus-5, sonnet-5), reachable
 *   through a personal Anthropic account, a work Anthropic account, and
 *   an OpenRouter account routed through OpenCode (opus-5 only).
 * - Qwen family: one canonical model, reachable only through an Alibaba
 *   coding plan that happens to run on the Claude Code runtime (example D:
 *   access service, model family, and agent runtime are independent axes).
 */
const SNAPSHOT: AccessModelSnapshotPayload = {
  requestId: "req",
  fetchedAt: "2026-06-19T00:00:00.000Z",
  agentRuntimes: [
    { id: "claude", label: "Claude Code" },
    { id: "opencode", label: "OpenCode" },
  ],
  accessServices: [
    { id: "anthropic", label: "Anthropic" },
    { id: "openrouter", label: "OpenRouter" },
    { id: "alibaba", label: "Alibaba" },
  ],
  accounts: [
    {
      id: "acct-personal",
      accessServiceId: "anthropic",
      label: "Personal",
      identityConfidence: "unknown",
    },
    { id: "acct-work", accessServiceId: "anthropic", label: "Work", identityConfidence: "unknown" },
    {
      id: "acct-openrouter",
      accessServiceId: "openrouter",
      label: "OpenRouter Personal",
      identityConfidence: "unknown",
    },
    {
      id: "acct-alibaba",
      accessServiceId: "alibaba",
      label: "Alibaba Plan",
      identityConfidence: "unknown",
    },
  ],
  entitlements: [
    {
      id: "ent-personal",
      accountId: "acct-personal",
      label: "Personal Claude Pro",
      planLabel: "Claude Pro",
    },
    { id: "ent-work", accountId: "acct-work", label: "Work Claude Max", planLabel: "Claude Max" },
    {
      id: "ent-openrouter",
      accountId: "acct-openrouter",
      label: "OpenRouter Personal",
      planLabel: null,
    },
    { id: "ent-alibaba", accountId: "acct-alibaba", label: "Alibaba Coding Plan", planLabel: null },
  ],
  bindings: [
    {
      id: "claude-personal",
      agentRuntimeId: "claude",
      accessServiceId: "anthropic",
      accountId: "acct-personal",
      label: "Claude Code — Personal",
      enabled: true,
    },
    {
      id: "claude-work",
      agentRuntimeId: "claude",
      accessServiceId: "anthropic",
      accountId: "acct-work",
      label: "Claude Code — Work",
      enabled: true,
    },
    {
      id: "opencode-openrouter",
      agentRuntimeId: "opencode",
      accessServiceId: "openrouter",
      accountId: "acct-openrouter",
      label: "OpenCode — OpenRouter",
      enabled: true,
    },
    {
      id: "claude-alibaba",
      agentRuntimeId: "claude",
      accessServiceId: "alibaba",
      accountId: "acct-alibaba",
      label: "Claude Code — Alibaba",
      enabled: true,
    },
    {
      id: "claude-disabled",
      agentRuntimeId: "claude",
      accessServiceId: "anthropic",
      accountId: "acct-personal",
      label: "Claude Code — Disabled",
      enabled: false,
    },
  ],
  modelFamilies: [
    { id: "claude", label: "Claude" },
    { id: "qwen", label: "Qwen" },
  ],
  canonicalModels: [
    { id: "claude-opus-5", familyId: "claude", label: "Opus 5" },
    { id: "claude-sonnet-5", familyId: "claude", label: "Sonnet 5" },
    { id: "qwen-3-5-plus", familyId: "qwen", label: "Qwen 3.5 Plus" },
  ],
  routes: [
    { id: "r1", canonicalModelId: "claude-opus-5", bindingId: "claude-personal", modelId: "opus" },
    {
      id: "r2",
      canonicalModelId: "claude-sonnet-5",
      bindingId: "claude-personal",
      modelId: "sonnet",
    },
    { id: "r3", canonicalModelId: "claude-opus-5", bindingId: "claude-work", modelId: "opus" },
    { id: "r4", canonicalModelId: "claude-sonnet-5", bindingId: "claude-work", modelId: "sonnet" },
    {
      id: "r5",
      canonicalModelId: "claude-opus-5",
      bindingId: "opencode-openrouter",
      modelId: "anthropic/claude-opus-5",
    },
    {
      id: "r6",
      canonicalModelId: "qwen-3-5-plus",
      bindingId: "claude-alibaba",
      modelId: "qwen-3.5-plus",
    },
    // Orphaned: binding is disabled, must not appear anywhere.
    { id: "r7", canonicalModelId: "claude-opus-5", bindingId: "claude-disabled", modelId: "opus" },
  ],
};

function select(
  previous: FacetSelectionState,
  facet: "family" | "access" | "model" | "agent",
  value: string | null,
) {
  return applyFacetSelection({
    expandedRoutes: buildExpandedRoutes(SNAPSHOT),
    canonicalModels: SNAPSHOT.canonicalModels,
    previous,
    facet,
    value,
  });
}

describe("buildExpandedRoutes", () => {
  it("expands every route with its family/access/model/agent facet values", () => {
    const expanded = buildExpandedRoutes(SNAPSHOT);
    const opusPersonal = expanded.find((entry) => entry.route.id === "r1");
    expect(opusPersonal).toEqual({
      route: SNAPSHOT.routes[0],
      family: "claude",
      access: "ent-personal",
      model: "claude-opus-5",
      agent: "claude",
    });
  });

  it("drops routes whose binding is disabled", () => {
    const expanded = buildExpandedRoutes(SNAPSHOT);
    expect(expanded.some((entry) => entry.route.id === "r7")).toBe(false);
  });

  it("drops a route whose binding, canonical model, or entitlement is missing", () => {
    const missingBinding = buildExpandedRoutes({
      ...SNAPSHOT,
      routes: [{ id: "x", canonicalModelId: "claude-opus-5", bindingId: "nope", modelId: "opus" }],
    });
    expect(missingBinding).toHaveLength(0);

    const missingCanonicalModel = buildExpandedRoutes({
      ...SNAPSHOT,
      routes: [
        { id: "x", canonicalModelId: "nope", bindingId: "claude-personal", modelId: "opus" },
      ],
    });
    expect(missingCanonicalModel).toHaveLength(0);

    const missingEntitlement = buildExpandedRoutes({
      ...SNAPSHOT,
      entitlements: [],
    });
    expect(missingEntitlement).toHaveLength(0);
  });
});

describe("applyFacetSelection - family first (example A)", () => {
  it("selecting a family leaves access/model/agent open to every compatible value", () => {
    const state = select(EMPTY_FACET_SELECTION, "family", "claude");
    expect(state.values.family).toBe("claude");
    expect(state.provenance.family).toBe("explicit");

    const resolved = resolveFacetSelector(buildExpandedRoutes(SNAPSHOT), state);
    expect(resolved.availableAccess.sort()).toEqual(["ent-openrouter", "ent-personal", "ent-work"]);
    expect(resolved.availableModels.sort()).toEqual(["claude-opus-5", "claude-sonnet-5"]);
    expect(resolved.availableAgents.sort()).toEqual(["claude", "opencode"]);
    expect(resolved.launchable).toBe(false);
  });

  it("then selecting access forces agent when only one runtime serves that entitlement", () => {
    let state = select(EMPTY_FACET_SELECTION, "family", "claude");
    state = select(state, "access", "ent-personal");

    expect(state.values.agent).toBe("claude");
    expect(state.provenance.agent).toBe("forced");
  });

  it("then selecting a model resolves to exactly one launchable route", () => {
    let state = select(EMPTY_FACET_SELECTION, "family", "claude");
    state = select(state, "access", "ent-personal");
    state = select(state, "model", "claude-opus-5");

    const resolved = resolveFacetSelector(buildExpandedRoutes(SNAPSHOT), state);
    expect(resolved.launchable).toBe(true);
    expect(resolved.resolvedBindingId).toBe("claude-personal");
    expect(resolved.resolvedRuntimeModelId).toBe("opus");
  });
});

describe("applyFacetSelection - model first (example B)", () => {
  it("infers family from the selected model", () => {
    const state = select(EMPTY_FACET_SELECTION, "model", "claude-opus-5");
    expect(state.values.family).toBe("claude");
    expect(state.provenance.family).toBe("inferred");
  });

  it("does not force access/agent while several routes still serve the model", () => {
    const state = select(EMPTY_FACET_SELECTION, "model", "claude-opus-5");
    const resolved = resolveFacetSelector(buildExpandedRoutes(SNAPSHOT), state);
    expect(resolved.availableAgents.sort()).toEqual(["claude", "opencode"]);
    expect(resolved.availableAccess.sort()).toEqual(["ent-openrouter", "ent-personal", "ent-work"]);
  });

  it("choosing an agent afterward narrows access to the only compatible entitlement", () => {
    let state = select(EMPTY_FACET_SELECTION, "model", "claude-opus-5");
    state = select(state, "agent", "opencode");

    expect(state.values.access).toBe("ent-openrouter");
    expect(state.provenance.access).toBe("forced");
    expect(state.values.family).toBe("claude");

    const resolved = resolveFacetSelector(buildExpandedRoutes(SNAPSHOT), state);
    expect(resolved.launchable).toBe(true);
    expect(resolved.resolvedBindingId).toBe("opencode-openrouter");
    expect(resolved.resolvedRuntimeModelId).toBe("anthropic/claude-opus-5");
  });
});

describe("applyFacetSelection - access first (example C)", () => {
  it("shows only the models/agents that entitlement can actually reach", () => {
    const state = select(EMPTY_FACET_SELECTION, "access", "ent-openrouter");
    const resolved = resolveFacetSelector(buildExpandedRoutes(SNAPSHOT), state);
    expect(resolved.availableModels).toEqual(["claude-opus-5"]);
    expect(state.values.agent).toBe("opencode");
    expect(state.provenance.agent).toBe("forced");
  });
});

describe("applyFacetSelection - access routes a different family through a shared agent (example D)", () => {
  it("selecting the Alibaba entitlement forces family, model, and agent", () => {
    const state = select(EMPTY_FACET_SELECTION, "access", "ent-alibaba");
    expect(state.values.family).toBe("qwen");
    expect(state.provenance.family).toBe("forced");
    expect(state.values.model).toBe("qwen-3-5-plus");
    expect(state.values.agent).toBe("claude");
    expect(state.provenance.agent).toBe("forced");
  });
});

describe("applyFacetSelection - newest explicit choice wins", () => {
  it("clears an old explicit family that's now incompatible, without wrongly forcing siblings that still have options", () => {
    let state = select(EMPTY_FACET_SELECTION, "family", "qwen");
    expect(state.values.agent).toBe("claude");
    expect(state.provenance.agent).toBe("forced");

    // Opus 5 only exists under the Claude family - qwen cannot survive this.
    state = select(state, "model", "claude-opus-5");

    expect(state.values.family).toBe("claude");
    expect(state.provenance.family).toBe("forced");
    expect(state.values.model).toBe("claude-opus-5");
    expect(state.provenance.model).toBe("explicit");
    // Two Claude Code bindings (personal, work) plus OpenCode all serve
    // opus-5 - access and agent must stay open, not silently re-forced to
    // whatever they used to be under the old qwen selection.
    expect(state.values.access).toBeNull();
    expect(state.values.agent).toBeNull();
  });

  it("preserves an explicit selection that remains compatible with the newest choice", () => {
    let state = select(EMPTY_FACET_SELECTION, "family", "claude");
    state = select(state, "model", "claude-sonnet-5");

    expect(state.values.family).toBe("claude");
    expect(state.provenance.family).toBe("explicit");
    expect(state.values.model).toBe("claude-sonnet-5");
  });

  it("clearing a facet explicitly (value: null) drops it and lets siblings re-resolve", () => {
    let state = select(EMPTY_FACET_SELECTION, "access", "ent-personal");
    expect(state.provenance.agent).toBe("forced");

    state = select(state, "access", null);
    expect(state.values.access).toBeNull();
    expect(state.provenance.access).toBe("unselected");
    expect(state.values.agent).toBeNull();
  });
});

describe("applyFacetSelection - one entitlement shared by several runtimes", () => {
  it("groups bindings from different runtimes under the same access value", () => {
    const sharedSnapshot: AccessModelSnapshotPayload = {
      ...SNAPSHOT,
      bindings: [
        ...SNAPSHOT.bindings,
        {
          id: "opencode-openrouter-2",
          agentRuntimeId: "opencode",
          accessServiceId: "anthropic",
          accountId: "acct-personal",
          label: "OpenCode — Personal (shared)",
          enabled: true,
        },
      ],
      routes: [
        ...SNAPSHOT.routes,
        {
          id: "r8",
          canonicalModelId: "claude-opus-5",
          bindingId: "opencode-openrouter-2",
          modelId: "anthropic/claude-opus-5",
        },
      ],
    };
    const expandedRoutes = buildExpandedRoutes(sharedSnapshot);

    const state = applyFacetSelection({
      expandedRoutes,
      canonicalModels: sharedSnapshot.canonicalModels,
      previous: EMPTY_FACET_SELECTION,
      facet: "access",
      value: "ent-personal",
    });

    const resolved = resolveFacetSelector(expandedRoutes, state);
    expect(resolved.availableAgents.sort()).toEqual(["claude", "opencode"]);
    expect(resolved.launchable).toBe(false);
  });
});

describe("resolveFacetSelector - route availability changes", () => {
  it("drops a route that disappeared on refresh from the available options", () => {
    const expandedRoutes = buildExpandedRoutes(SNAPSHOT);
    const state = select(EMPTY_FACET_SELECTION, "access", "ent-personal");
    const beforeRefresh = resolveFacetSelector(expandedRoutes, state);
    expect(beforeRefresh.availableModels.sort()).toEqual(["claude-opus-5", "claude-sonnet-5"]);

    const refreshedSnapshot: AccessModelSnapshotPayload = {
      ...SNAPSHOT,
      routes: SNAPSHOT.routes.filter((route) => route.id !== "r2"),
    };
    const refreshedExpandedRoutes = buildExpandedRoutes(refreshedSnapshot);
    const afterRefresh = resolveFacetSelector(refreshedExpandedRoutes, state);
    expect(afterRefresh.availableModels).toEqual(["claude-opus-5"]);
  });
});

describe("resolveFacetSelector", () => {
  it("is not launchable with nothing selected, and exposes every top-level facet value", () => {
    const resolved = resolveFacetSelector(buildExpandedRoutes(SNAPSHOT), EMPTY_FACET_SELECTION);
    expect(resolved.launchable).toBe(false);
    expect(resolved.availableFamilies.sort()).toEqual(["claude", "qwen"]);
  });

  it("is not launchable while several routes remain (e.g. two accounts still both valid)", () => {
    const state = select(EMPTY_FACET_SELECTION, "model", "claude-opus-5");
    const resolved = resolveFacetSelector(buildExpandedRoutes(SNAPSHOT), state);
    expect(resolved.launchable).toBe(false);
    expect(resolved.remainingRoutes.length).toBeGreaterThan(1);
  });

  it("treats an empty route universe as nothing available and nothing launchable", () => {
    const resolved = resolveFacetSelector([], EMPTY_FACET_SELECTION);
    expect(resolved.availableFamilies).toEqual([]);
    expect(resolved.availableAccess).toEqual([]);
    expect(resolved.availableModels).toEqual([]);
    expect(resolved.availableAgents).toEqual([]);
    expect(resolved.launchable).toBe(false);
  });
});
