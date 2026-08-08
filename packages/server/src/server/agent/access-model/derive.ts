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

export function deriveModelFamilies(): ModelFamily[] {
  return [CLAUDE_MODEL_FAMILY];
}

export function deriveCanonicalModels(): CanonicalModel[] {
  return [...CLAUDE_CANONICAL_MODELS];
}

/**
 * Routes only exist where a canonical model's runtime model id is known ahead
 * of a live session — today that's the curated Claude manifest only. A
 * binding only gets Claude routes when it resolves to the known "anthropic"
 * access service; a custom profile that merely extends "claude" (e.g. a Z.AI
 * endpoint) does not serve Anthropic's models under these ids, so it stays
 * routeless. Other runtimes report models dynamically from a live agent
 * process (see fetchCatalog in docs/providers.md), so they have no
 * synchronous source to route from yet.
 */
export function deriveRoutes(bindings: Binding[]): Route[] {
  const routes: Route[] = [];
  for (const binding of bindings) {
    if (binding.accessServiceId !== "anthropic") {
      continue;
    }
    for (const model of CLAUDE_CANONICAL_MODELS) {
      routes.push({
        id: `${binding.id}::${model.id}`,
        canonicalModelId: model.id,
        bindingId: binding.id,
        modelId: model.id,
      });
    }
  }
  return routes;
}
