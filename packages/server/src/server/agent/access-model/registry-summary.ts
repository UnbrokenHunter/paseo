import type { AgentProvider } from "../agent-sdk-types.js";
import type { ProviderDefinition } from "../provider-registry.js";

/**
 * The subset of a resolved ProviderDefinition the access-model derivation
 * functions need. Kept separate from ProviderDefinition so derive.ts stays
 * pure and testable without constructing real provider clients.
 */
export interface RegisteredProviderSummary {
  providerId: string;
  label: string;
  description: string;
  enabled: boolean;
  derivedFromProviderId: string | null;
}

export function summarizeProviderRegistry(
  registry: Record<AgentProvider, ProviderDefinition>,
): RegisteredProviderSummary[] {
  return Object.entries(registry).map(([providerId, definition]) => ({
    providerId,
    label: definition.label,
    description: definition.description,
    enabled: definition.enabled,
    derivedFromProviderId: definition.derivedFromProviderId,
  }));
}
