import type { AccessModelSnapshotPayload } from "@/access-model/types";
import { buildFavoriteModelKey } from "@/hooks/use-form-preferences";
import type { ProviderSelectionModelRow, ProviderSelectorProvider } from "./provider-selection";

export interface ModelFamilyGroup {
  familyId: string;
  familyLabel: string;
  providerIds: string[];
  providerLabelById: Map<string, string>;
}

export interface ModelFamilyGrouping {
  groupByProviderId: Map<string, ModelFamilyGroup>;
  modelRowsByProviderId: Map<string, ProviderSelectionModelRow[]>;
}

export const EMPTY_MODEL_FAMILY_GROUPING: ModelFamilyGrouping = {
  groupByProviderId: new Map(),
  modelRowsByProviderId: new Map(),
};

/**
 * Groups bindings that share a Model Family (e.g. two Claude accounts) so the
 * browser can offer an Access + Model facet instead of two unrelated flat
 * provider rows. Only families with a route for more than one available
 * provider are grouped -- the common single-account case renders exactly as
 * before, and runtimes with no route data (everything but Claude today) never
 * group, falling back to the flat provider/model list.
 */
export function buildModelFamilyGrouping(input: {
  providers: ProviderSelectorProvider[];
  snapshot: AccessModelSnapshotPayload | null;
}): ModelFamilyGrouping {
  if (!input.snapshot) {
    return EMPTY_MODEL_FAMILY_GROUPING;
  }

  const providerLabelById = new Map(
    input.providers.map((provider) => [provider.id, provider.label]),
  );
  const familyById = new Map(input.snapshot.modelFamilies.map((family) => [family.id, family]));
  const canonicalModelById = new Map(
    input.snapshot.canonicalModels.map((model) => [model.id, model]),
  );

  const providerIdsByFamily = new Map<string, string[]>();
  const routeModelIdByKey = new Map<string, string>();

  for (const route of input.snapshot.routes) {
    if (!providerLabelById.has(route.bindingId)) {
      continue;
    }
    const canonicalModel = canonicalModelById.get(route.canonicalModelId);
    const family = canonicalModel ? familyById.get(canonicalModel.familyId) : undefined;
    if (!canonicalModel || !family) {
      continue;
    }

    routeModelIdByKey.set(`${route.bindingId}::${route.canonicalModelId}`, route.modelId);

    const providerIds = providerIdsByFamily.get(family.id) ?? [];
    if (!providerIds.includes(route.bindingId)) {
      providerIds.push(route.bindingId);
    }
    providerIdsByFamily.set(family.id, providerIds);
  }

  const groupByProviderId = new Map<string, ModelFamilyGroup>();
  for (const [familyId, providerIds] of providerIdsByFamily) {
    if (providerIds.length < 2) {
      continue;
    }
    const family = familyById.get(familyId);
    if (!family) {
      continue;
    }
    const group: ModelFamilyGroup = {
      familyId,
      familyLabel: family.label,
      providerIds,
      providerLabelById: new Map(providerIds.map((id) => [id, providerLabelById.get(id) ?? id])),
    };
    for (const id of providerIds) {
      groupByProviderId.set(id, group);
    }
  }

  const modelRowsByProviderId = new Map<string, ProviderSelectionModelRow[]>();
  for (const [providerId, group] of groupByProviderId) {
    const providerLabel = group.providerLabelById.get(providerId) ?? providerId;
    const rows: ProviderSelectionModelRow[] = [];
    for (const model of input.snapshot.canonicalModels) {
      if (model.familyId !== group.familyId) {
        continue;
      }
      const routeModelId = routeModelIdByKey.get(`${providerId}::${model.id}`);
      if (!routeModelId) {
        continue;
      }
      rows.push({
        favoriteKey: buildFavoriteModelKey({ provider: providerId, modelId: routeModelId }),
        provider: providerId,
        providerLabel,
        modelId: routeModelId,
        modelLabel: model.label,
        description: model.description,
      });
    }
    modelRowsByProviderId.set(providerId, rows);
  }

  return { groupByProviderId, modelRowsByProviderId };
}
