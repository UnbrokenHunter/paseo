/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useFacetedModelSelector } from "./faceted-model-selector-state";
import type { AccessModelSnapshotPayload } from "./types";

// Two canonical models under one binding, so selecting a family alone still
// leaves the model facet ambiguous - a more representative fixture than a
// single-route universe, where everything would already be forced.
const SNAPSHOT: AccessModelSnapshotPayload = {
  requestId: "req",
  fetchedAt: "2026-06-19T00:00:00.000Z",
  agentRuntimes: [{ id: "claude", label: "Claude Code" }],
  accessServices: [{ id: "anthropic", label: "Anthropic" }],
  accounts: [
    {
      id: "acct-personal",
      accessServiceId: "anthropic",
      label: "Personal",
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
  ],
  modelFamilies: [{ id: "claude", label: "Claude" }],
  canonicalModels: [
    { id: "claude-opus-5", familyId: "claude", label: "Opus 5" },
    { id: "claude-sonnet-5", familyId: "claude", label: "Sonnet 5" },
  ],
  routes: [
    { id: "r1", canonicalModelId: "claude-opus-5", bindingId: "claude-personal", modelId: "opus" },
    {
      id: "r2",
      canonicalModelId: "claude-sonnet-5",
      bindingId: "claude-personal",
      modelId: "sonnet",
    },
  ],
};

const SINGLE_ROUTE_SNAPSHOT: AccessModelSnapshotPayload = {
  ...SNAPSHOT,
  canonicalModels: [
    SNAPSHOT.canonicalModels[0] as AccessModelSnapshotPayload["canonicalModels"][number],
  ],
  routes: [SNAPSHOT.routes[0] as AccessModelSnapshotPayload["routes"][number]],
};

describe("useFacetedModelSelector", () => {
  it("starts with nothing selected, not launchable, and a generic title", () => {
    const { result } = renderHook(() => useFacetedModelSelector({ snapshot: SNAPSHOT }));
    expect(result.current.launchable).toBe(false);
    expect(result.current.title).toBe("Select model");
    expect(result.current.activeFacet).toBe("family");
  });

  it("resolves to a launchable binding once every facet settles", () => {
    const { result } = renderHook(() =>
      useFacetedModelSelector({ snapshot: SINGLE_ROUTE_SNAPSHOT }),
    );

    act(() => {
      result.current.selectFacetValue("family", "claude");
    });

    // Only one route exists in this snapshot, so everything forces from a
    // single explicit pick.
    expect(result.current.launchable).toBe(true);
    expect(result.current.resolvedBindingId).toBe("claude-personal");
    expect(result.current.resolvedRuntimeModelId).toBe("opus");
    expect(result.current.title).toBe("Claude · Personal Claude Pro · Opus 5 · Claude Code");
  });

  it("advances the active facet to the next unresolved one after an explicit pick", () => {
    const { result } = renderHook(() => useFacetedModelSelector({ snapshot: SNAPSHOT }));

    act(() => {
      result.current.selectFacetValue("family", "claude");
    });

    // Model still has two options (opus-5, sonnet-5), so the selector should
    // land there next rather than staying on the resolved family tab.
    expect(result.current.activeFacet).toBe("model");
    expect(result.current.launchable).toBe(false);
  });

  it("returns no options and no launchable state with no snapshot", () => {
    const { result } = renderHook(() => useFacetedModelSelector({ snapshot: null }));
    expect(result.current.optionsForActiveFacet).toEqual([]);
    expect(result.current.launchable).toBe(false);
  });
});
