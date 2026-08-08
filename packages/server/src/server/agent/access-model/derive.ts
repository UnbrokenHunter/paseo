import type {
  AccessService,
  Account,
  AgentRuntime,
  Binding,
} from "@getpaseo/protocol/access-model";
import { AGENT_PROVIDER_DEFINITIONS } from "@getpaseo/protocol/provider-manifest";

import { ACCESS_SERVICE_ID_BY_BUILTIN_RUNTIME, KNOWN_ACCESS_SERVICES } from "./known-mappings.js";
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
