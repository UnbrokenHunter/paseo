import { describe, expect, it } from "vitest";
import type { ModelFamilyGroup } from "@/provider-selection/model-family-grouping";
import type { ProviderSelectorProvider } from "@/provider-selection/provider-selection";
import { resolveInitialModelBrowserView } from "./model-browser-view";

function provider(id: string, label: string): ProviderSelectorProvider {
  return {
    id,
    label,
    modelSelection: { kind: "models", rows: [] },
  };
}

describe("model browser initial view", () => {
  const codex = provider("codex", "Codex");
  const pi = provider("pi", "Pi");

  it("opens a sole provider directly", () => {
    expect(
      resolveInitialModelBrowserView({
        providers: [pi],
        selectedProvider: "",
        selectedModel: "",
        favoriteKeys: new Set(),
      }),
    ).toEqual({ kind: "provider", providerId: "pi", providerLabel: "Pi" });
  });

  it("opens the selected provider when its model is not a favorite", () => {
    expect(
      resolveInitialModelBrowserView({
        providers: [codex, pi],
        selectedProvider: "pi",
        selectedModel: "pi-pro",
        favoriteKeys: new Set(),
      }),
    ).toEqual({ kind: "provider", providerId: "pi", providerLabel: "Pi" });
  });

  it("opens the provider overview when the selected model is a favorite", () => {
    expect(
      resolveInitialModelBrowserView({
        providers: [codex, pi],
        selectedProvider: "pi",
        selectedModel: "pi-pro",
        favoriteKeys: new Set(["pi:pi-pro"]),
      }),
    ).toEqual({ kind: "all" });
  });

  it("opens the family view when the selected provider belongs to a model family group", () => {
    const claude = provider("claude", "Claude Code");
    const group: ModelFamilyGroup = {
      familyId: "claude",
      familyLabel: "Claude",
      providerIds: ["claude", "claude-work"],
      providerLabelById: new Map([
        ["claude", "Claude Code"],
        ["claude-work", "Claude (Work)"],
      ]),
    };
    expect(
      resolveInitialModelBrowserView({
        providers: [claude, pi],
        selectedProvider: "claude",
        selectedModel: "claude-opus-5",
        favoriteKeys: new Set(),
        familyGroupByProviderId: new Map([
          ["claude", group],
          ["claude-work", group],
        ]),
      }),
    ).toEqual({
      kind: "family",
      familyId: "claude",
      familyLabel: "Claude",
      providerId: "claude",
      providerLabel: "Claude Code",
    });
  });
});
