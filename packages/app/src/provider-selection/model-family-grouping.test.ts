import { describe, expect, it } from "vitest";
import type { AccessModelSnapshotPayload } from "@/access-model/types";
import { buildModelFamilyGrouping } from "./model-family-grouping";
import type { ProviderSelectorProvider } from "./provider-selection";

function provider(id: string, label: string): ProviderSelectorProvider {
  return { id, label, modelSelection: { kind: "models", rows: [] } };
}

function snapshot(overrides: Partial<AccessModelSnapshotPayload>): AccessModelSnapshotPayload {
  return {
    requestId: "req",
    fetchedAt: "2026-06-19T00:00:00.000Z",
    agentRuntimes: [],
    accessServices: [],
    accounts: [],
    bindings: [],
    modelFamilies: [],
    canonicalModels: [],
    routes: [],
    ...overrides,
  };
}

describe("buildModelFamilyGrouping", () => {
  it("returns empty grouping when there is no snapshot", () => {
    const grouping = buildModelFamilyGrouping({
      providers: [provider("claude", "Claude")],
      snapshot: null,
    });
    expect(grouping.groupByProviderId.size).toBe(0);
    expect(grouping.modelRowsByProviderId.size).toBe(0);
  });

  it("does not group a family with only one available binding", () => {
    const grouping = buildModelFamilyGrouping({
      providers: [provider("claude", "Claude Code")],
      snapshot: snapshot({
        modelFamilies: [{ id: "claude", label: "Claude" }],
        canonicalModels: [{ id: "claude-opus-5", familyId: "claude", label: "Opus 5" }],
        routes: [
          {
            id: "claude::claude-opus-5",
            canonicalModelId: "claude-opus-5",
            bindingId: "claude",
            modelId: "claude-opus-5",
          },
        ],
      }),
    });
    expect(grouping.groupByProviderId.size).toBe(0);
  });

  it("groups two bindings that route to the same family", () => {
    const grouping = buildModelFamilyGrouping({
      providers: [provider("claude", "Claude Code"), provider("claude-work", "Claude (Work)")],
      snapshot: snapshot({
        modelFamilies: [{ id: "claude", label: "Claude" }],
        canonicalModels: [
          { id: "claude-opus-5", familyId: "claude", label: "Opus 5" },
          { id: "claude-sonnet-5", familyId: "claude", label: "Sonnet 5" },
        ],
        routes: [
          {
            id: "claude::claude-opus-5",
            canonicalModelId: "claude-opus-5",
            bindingId: "claude",
            modelId: "claude-opus-5",
          },
          {
            id: "claude::claude-sonnet-5",
            canonicalModelId: "claude-sonnet-5",
            bindingId: "claude",
            modelId: "claude-sonnet-5",
          },
          {
            id: "claude-work::claude-opus-5",
            canonicalModelId: "claude-opus-5",
            bindingId: "claude-work",
            modelId: "claude-opus-5",
          },
          {
            id: "claude-work::claude-sonnet-5",
            canonicalModelId: "claude-sonnet-5",
            bindingId: "claude-work",
            modelId: "claude-sonnet-5",
          },
        ],
      }),
    });

    const group = grouping.groupByProviderId.get("claude");
    expect(group).toBeDefined();
    expect(group?.providerIds.sort()).toEqual(["claude", "claude-work"]);
    expect(grouping.groupByProviderId.get("claude-work")).toBe(group);

    const rows = grouping.modelRowsByProviderId.get("claude-work");
    expect(rows?.map((row) => row.modelId).sort()).toEqual(["claude-opus-5", "claude-sonnet-5"]);
    expect(rows?.every((row) => row.provider === "claude-work")).toBe(true);
  });

  it("ignores routes for bindings that are not in the available provider list", () => {
    const grouping = buildModelFamilyGrouping({
      providers: [provider("claude", "Claude Code")],
      snapshot: snapshot({
        modelFamilies: [{ id: "claude", label: "Claude" }],
        canonicalModels: [{ id: "claude-opus-5", familyId: "claude", label: "Opus 5" }],
        routes: [
          {
            id: "claude::claude-opus-5",
            canonicalModelId: "claude-opus-5",
            bindingId: "claude",
            modelId: "claude-opus-5",
          },
          {
            id: "disabled-claude::claude-opus-5",
            canonicalModelId: "claude-opus-5",
            bindingId: "disabled-claude",
            modelId: "claude-opus-5",
          },
        ],
      }),
    });
    expect(grouping.groupByProviderId.size).toBe(0);
  });
});
