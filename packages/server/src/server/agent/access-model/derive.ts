import type {
  AccessService,
  Account,
  AgentRuntime,
  Binding,
  CanonicalModel,
  Entitlement,
  ModelFamily,
  Route,
} from "@getpaseo/protocol/access-model";
import { AGENT_PROVIDER_DEFINITIONS } from "@getpaseo/protocol/provider-manifest";

import {
  ACCESS_SERVICE_ID_BY_BUILTIN_RUNTIME,
  CLAUDE_CANONICAL_MODELS,
  CLAUDE_MODEL_FAMILY,
  KNOWN_ACCESS_SERVICES,
} from "./known-mappings.js";
import {
  inferModelFamily,
  normalizeRuntimeModelId,
  UNKNOWN_MODEL_FAMILY,
} from "./model-family-inference.js";
import type { RegisteredProviderSummary } from "./registry-summary.js";

export function deriveAgentRuntimes(): AgentRuntime[] {
  return AGENT_PROVIDER_DEFINITIONS.map((definition) => ({
    id: definition.id,
    label: definition.label,
    description: definition.description,
  }));
}

function resolveAccessServiceId(provider: RegisteredProviderSummary): string {
  if (provider.derivedFromProviderId === null) {
    return (
      ACCESS_SERVICE_ID_BY_BUILTIN_RUNTIME[provider.providerId] ?? `unknown:${provider.providerId}`
    );
  }
  if (!provider.hasCustomEndpoint) {
    const baseAccessServiceId =
      ACCESS_SERVICE_ID_BY_BUILTIN_RUNTIME[provider.derivedFromProviderId];
    if (baseAccessServiceId) {
      return baseAccessServiceId;
    }
  }
  return `unknown:${provider.providerId}`;
}

function accountId(providerId: string): string {
  return `acct:${providerId}`;
}

export function deriveAccessServices(providers: RegisteredProviderSummary[]): AccessService[] {
  const services = new Map<string, AccessService>();
  for (const provider of providers) {
    const id = resolveAccessServiceId(provider);
    if (services.has(id)) {
      continue;
    }
    services.set(
      id,
      KNOWN_ACCESS_SERVICES[id] ?? {
        id,
        label: provider.label,
        description: `Access service not identified for "${provider.label}"; treated as its own group.`,
      },
    );
  }
  return [...services.values()];
}

export function deriveAccounts(providers: RegisteredProviderSummary[]): Account[] {
  return providers.map((provider) => ({
    id: accountId(provider.providerId),
    accessServiceId: resolveAccessServiceId(provider),
    label: provider.label,
    identityConfidence: "unknown",
  }));
}

function entitlementId(providerId: string): string {
  return `ent:${providerId}`;
}

/**
 * One entitlement per account, 1:1, until real evidence justifies treating
 * two bindings as sharing one quota pool. Account.identityConfidence is
 * always "unknown" today (see deriveAccounts) — there's no verified or
 * user-linked identity signal yet, so entitlements are never merged.
 * Merging on nothing but a shared access service would violate the
 * architecture's "do not guess shared quota pools" invariant.
 */
export function deriveEntitlements(providers: RegisteredProviderSummary[]): Entitlement[] {
  return providers.map((provider) => ({
    id: entitlementId(provider.providerId),
    accountId: accountId(provider.providerId),
    label: provider.label,
    planLabel: null,
  }));
}

export function deriveBindings(providers: RegisteredProviderSummary[]): Binding[] {
  return providers.map((provider) => ({
    id: provider.providerId,
    agentRuntimeId: provider.derivedFromProviderId ?? provider.providerId,
    accessServiceId: resolveAccessServiceId(provider),
    accountId: accountId(provider.providerId),
    label: provider.label,
    enabled: provider.enabled,
  }));
}

/**
 * Models a runtime reported from a live catalog fetch, keyed by the
 * provider/profile (binding) id that reported them. This is the discovery
 * half of the catalog: static metadata (the Claude manifest) enriches it,
 * but runtime discovery decides what is actually available, so a runtime
 * exposing a model Paseo has never heard of still produces a usable route.
 */
export interface DiscoveredProviderModels {
  providerId: string;
  models: { id: string; label?: string; description?: string }[];
}

interface DerivedCatalog {
  families: ModelFamily[];
  canonicalModels: CanonicalModel[];
  routes: Route[];
}

/**
 * The whole capability catalog in one pass, because families, canonical
 * models, and routes are three views of the same join and deriving them
 * separately would mean repeating it (and risking them disagreeing).
 *
 * Two sources are merged:
 * - the curated Claude manifest, which gives Anthropic bindings good
 *   labels and full coverage before any live fetch has happened;
 * - whatever each binding's runtime actually reported, which wins on
 *   availability and is the only source for every non-Claude runtime.
 *
 * A discovered model keeps its exact runtime id on the Route while its
 * canonical id is the vendor-prefix-stripped form, so the same model
 * reached through two runtimes collapses to one entry in the Model facet
 * instead of appearing once per runtime.
 */
export function deriveCatalog(
  bindings: Binding[],
  discovered: DiscoveredProviderModels[] = [],
): DerivedCatalog {
  const canonicalModelById = new Map<string, CanonicalModel>();
  for (const model of CLAUDE_CANONICAL_MODELS) {
    canonicalModelById.set(model.id, model);
  }

  const routeByKey = new Map<string, Route>();
  const enabledBindingIds = new Set(
    bindings.filter((binding) => binding.enabled).map((binding) => binding.id),
  );

  // Curated Claude coverage for bindings that resolve to Anthropic itself.
  // A profile pointed at a different backend (Z.AI, Alibaba) is excluded:
  // it does not serve Anthropic's models under these ids, so its models
  // can only come from its own runtime discovery below.
  for (const binding of bindings) {
    if (!binding.enabled || binding.accessServiceId !== "anthropic") continue;
    for (const model of CLAUDE_CANONICAL_MODELS) {
      const key = `${binding.id}::${model.id}`;
      routeByKey.set(key, {
        id: key,
        canonicalModelId: model.id,
        bindingId: binding.id,
        modelId: model.id,
      });
    }
  }

  for (const entry of discovered) {
    if (!enabledBindingIds.has(entry.providerId)) continue;
    for (const model of entry.models) {
      const runtimeModelId = model.id.trim();
      // The selector's synthetic "default model" row carries an empty id;
      // it is a UI affordance, not a model, and has no canonical identity.
      if (!runtimeModelId) continue;

      const canonicalId = normalizeRuntimeModelId(runtimeModelId);
      if (!canonicalModelById.has(canonicalId)) {
        canonicalModelById.set(canonicalId, {
          id: canonicalId,
          familyId: inferModelFamily(runtimeModelId, model.label).id,
          label: model.label?.trim() || runtimeModelId,
          ...(model.description ? { description: model.description } : {}),
        });
      }

      // Discovery wins over the curated manifest for the same binding and
      // canonical model: the runtime is authoritative about the id it will
      // actually accept.
      const key = `${entry.providerId}::${canonicalId}`;
      routeByKey.set(key, {
        id: key,
        canonicalModelId: canonicalId,
        bindingId: entry.providerId,
        modelId: runtimeModelId,
      });
    }
  }

  const canonicalModels = [...canonicalModelById.values()];
  const referencedFamilyIds = new Set<string>();
  for (const route of routeByKey.values()) {
    const familyId = canonicalModelById.get(route.canonicalModelId)?.familyId;
    if (familyId) referencedFamilyIds.add(familyId);
  }

  const familyById = new Map<string, ModelFamily>([
    [CLAUDE_MODEL_FAMILY.id, CLAUDE_MODEL_FAMILY],
    [UNKNOWN_MODEL_FAMILY.id, UNKNOWN_MODEL_FAMILY],
  ]);
  for (const model of canonicalModels) {
    if (familyById.has(model.familyId)) continue;
    familyById.set(model.familyId, inferModelFamily(model.id, model.label));
  }

  return {
    // Only families something can actually route to, so the Family facet
    // never offers a dead end.
    families: [...familyById.values()].filter((family) => referencedFamilyIds.has(family.id)),
    canonicalModels,
    routes: [...routeByKey.values()],
  };
}
