import type { ModelFamilyGroup } from "@/provider-selection/model-family-grouping";
import type { ProviderSelectorProvider } from "@/provider-selection/provider-selection";

export type ModelBrowserView =
  | { kind: "all" }
  | { kind: "provider"; providerId: string; providerLabel: string }
  | {
      kind: "family";
      familyId: string;
      familyLabel: string;
      providerId: string;
      providerLabel: string;
    };

export function resolveInitialModelBrowserView({
  providers,
  selectedProvider,
  selectedModel,
  favoriteKeys,
  familyGroupByProviderId = new Map<string, ModelFamilyGroup>(),
}: {
  providers: ProviderSelectorProvider[];
  selectedProvider: string;
  selectedModel: string;
  favoriteKeys: Set<string>;
  familyGroupByProviderId?: Map<string, ModelFamilyGroup>;
}): ModelBrowserView {
  const singleProvider = providers.length === 1 ? providers[0] : undefined;
  if (singleProvider) {
    return {
      kind: "provider",
      providerId: singleProvider.id,
      providerLabel: singleProvider.label,
    };
  }

  const selectedFavoriteKey = `${selectedProvider}:${selectedModel}`;
  const shouldOpenSelectedProvider =
    selectedProvider.length > 0 &&
    selectedModel.length > 0 &&
    !favoriteKeys.has(selectedFavoriteKey);
  if (shouldOpenSelectedProvider) {
    const provider = providers.find((entry) => entry.id === selectedProvider);
    if (provider) {
      const group = familyGroupByProviderId.get(provider.id);
      if (group) {
        return {
          kind: "family",
          familyId: group.familyId,
          familyLabel: group.familyLabel,
          providerId: provider.id,
          providerLabel: provider.label,
        };
      }
      return { kind: "provider", providerId: provider.id, providerLabel: provider.label };
    }
  }

  return { kind: "all" };
}
