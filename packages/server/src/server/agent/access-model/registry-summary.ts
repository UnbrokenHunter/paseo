import type { ProviderOverride } from "@getpaseo/protocol/provider-config";
import type { AgentProvider } from "../agent-sdk-types.js";
import type { ProviderDefinition } from "../provider-registry.js";
import { BASE_URL_ENV_KEY_BY_BUILTIN_RUNTIME } from "./known-mappings.js";

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
  /**
   * True when this profile's own declared env redirects its base runtime at
   * a different backend (e.g. ANTHROPIC_BASE_URL). Only meaningful when
   * derivedFromProviderId is set; see BASE_URL_ENV_KEY_BY_BUILTIN_RUNTIME.
   */
  hasCustomEndpoint: boolean;
  /**
   * This profile's own declared env (not merged with its base's). Lets
   * downstream consumers (e.g. per-binding usage fetch) read a specific
   * override key, such as CLAUDE_CONFIG_DIR, without re-plumbing raw
   * provider overrides through another layer.
   */
  env: Record<string, string> | undefined;
}

function resolveHasCustomEndpoint(
  derivedFromProviderId: string | null,
  providerId: string,
  providerOverrides: Record<string, ProviderOverride>,
): boolean {
  if (derivedFromProviderId === null) {
    return false;
  }
  const baseUrlEnvKey = BASE_URL_ENV_KEY_BY_BUILTIN_RUNTIME[derivedFromProviderId];
  if (!baseUrlEnvKey) {
    return false;
  }
  return providerOverrides[providerId]?.env?.[baseUrlEnvKey] !== undefined;
}

export function summarizeProviderRegistry(
  registry: Record<AgentProvider, ProviderDefinition>,
  providerOverrides: Record<string, ProviderOverride> = {},
): RegisteredProviderSummary[] {
  return Object.entries(registry).map(([providerId, definition]) => ({
    providerId,
    label: definition.label,
    description: definition.description,
    enabled: definition.enabled,
    derivedFromProviderId: definition.derivedFromProviderId,
    hasCustomEndpoint: resolveHasCustomEndpoint(
      definition.derivedFromProviderId,
      providerId,
      providerOverrides,
    ),
    env: providerOverrides[providerId]?.env,
  }));
}
