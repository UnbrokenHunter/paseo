import { ProviderOverrideSchema } from "./agent/provider-launch-config.js";
import type { PersistedConfig } from "./persisted-config.js";

type MutableDaemonConfig = import("@getpaseo/protocol/messages").MutableDaemonConfig;
type MutableDaemonConfigPatch = import("@getpaseo/protocol/messages").MutableDaemonConfigPatch;
type ProviderOverride = import("./agent/provider-launch-config.js").ProviderOverride;

export interface ProviderRename {
  from: string;
  to: string;
}

interface MutableProviderMutationPlan {
  mergePatch: Omit<
    MutableDaemonConfigPatch,
    "removeProviders" | "replaceProviders" | "renameProviders"
  >;
  removedProviders: string[];
  replacedProviders: string[];
  renamedProviders: ProviderRename[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function omitProvidersFromConfig<T extends { providers?: Record<string, unknown> }>(
  config: T,
  providers: readonly string[],
): T {
  if (providers.length === 0 || !config.providers) {
    return config;
  }

  let changed = false;
  const nextProviders = { ...config.providers };
  for (const provider of providers) {
    if (provider in nextProviders) {
      delete nextProviders[provider];
      changed = true;
    }
  }

  return changed ? ({ ...config, providers: nextProviders } as T) : config;
}

function omitMetadataGenerationProvidersFromConfig<
  T extends { metadataGeneration?: { providers?: Array<{ provider?: unknown }> } },
>(config: T, providers: readonly string[]): T {
  if (providers.length === 0 || !config.metadataGeneration?.providers) {
    return config;
  }

  const removedProviderIds = new Set(providers);
  const nextProviders = config.metadataGeneration.providers.filter((entry) => {
    return typeof entry.provider !== "string" || !removedProviderIds.has(entry.provider);
  });
  if (nextProviders.length === config.metadataGeneration.providers.length) {
    return config;
  }

  return {
    ...config,
    metadataGeneration: {
      ...config.metadataGeneration,
      providers: nextProviders,
    },
  } as T;
}

function omitProvidersFromOverrides(
  overrides: Record<string, ProviderOverride> | undefined,
  providers: readonly string[],
): Record<string, ProviderOverride> | undefined {
  if (!overrides) {
    return undefined;
  }

  const nextOverrides = { ...overrides };
  for (const provider of providers) {
    delete nextOverrides[provider];
  }

  return Object.keys(nextOverrides).length > 0 ? nextOverrides : undefined;
}

function omitProvidersFromPersistedAgents(
  agents: PersistedConfig["agents"],
): Record<string, unknown> | undefined {
  if (!agents) {
    return undefined;
  }

  const { providers: _providers, ...rest } = agents as Record<string, unknown>;
  return Object.keys(rest).length > 0 ? rest : undefined;
}

function readMetadataGenerationProviders(
  mutable: MutableDaemonConfig,
): Array<{ provider: string; model?: string; thinkingOptionId?: string }> {
  const metadataGeneration = mutable.metadataGeneration;
  if (!isRecord(metadataGeneration)) {
    return [];
  }
  const providers = metadataGeneration["providers"];
  if (!Array.isArray(providers)) {
    return [];
  }
  return providers.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry["provider"] !== "string") {
      return [];
    }
    return [
      {
        provider: entry["provider"],
        ...(typeof entry["model"] === "string" ? { model: entry["model"] } : {}),
        ...(typeof entry["thinkingOptionId"] === "string"
          ? { thinkingOptionId: entry["thinkingOptionId"] }
          : {}),
      },
    ];
  });
}

/**
 * A rename carries no mutation of its own: the caller already sends the new definition in
 * `replaceProviders` (or `providers`) and the old id in `removeProviders`. Reject renames that
 * don't match that shape rather than half-applying one.
 */
function assertProviderMutationsAreConsistent(params: {
  replacedProviders: readonly string[];
  removedProviderSet: ReadonlySet<string>;
  renameProviders: Record<string, string>;
  definedProviders: ReadonlySet<string>;
}): void {
  const { replacedProviders, removedProviderSet, renameProviders, definedProviders } = params;
  const conflictingProvider = replacedProviders.find((providerId) =>
    removedProviderSet.has(providerId),
  );
  if (conflictingProvider) {
    throw new Error(`Provider ${conflictingProvider} cannot be removed and replaced together`);
  }
  for (const [from, to] of Object.entries(renameProviders)) {
    if (from === to) {
      throw new Error(`Provider rename for ${from} must change the provider id`);
    }
    if (!removedProviderSet.has(from)) {
      throw new Error(`Provider rename from ${from} must also remove ${from}`);
    }
    if (!definedProviders.has(to)) {
      throw new Error(`Provider rename to ${to} must also define ${to}`);
    }
  }
}

export function planProviderConfigMutations(
  patch: MutableDaemonConfigPatch,
): MutableProviderMutationPlan {
  const {
    removeProviders = [],
    replaceProviders = {},
    renameProviders = {},
    ...configPatch
  } = patch;
  const renamedProviderMap = renameProviders as Record<string, string>;
  const removedProviders = Array.from(new Set(removeProviders));
  const replacedProviders = Object.keys(replaceProviders);
  const removedProviderSet = new Set(removedProviders);
  assertProviderMutationsAreConsistent({
    replacedProviders,
    removedProviderSet,
    renameProviders: renamedProviderMap,
    definedProviders: new Set([...replacedProviders, ...Object.keys(configPatch.providers ?? {})]),
  });

  return {
    mergePatch:
      replacedProviders.length > 0
        ? {
            ...configPatch,
            providers: { ...configPatch.providers, ...replaceProviders },
          }
        : configPatch,
    removedProviders,
    replacedProviders,
    renamedProviders: Object.entries(renamedProviderMap).map(([from, to]) => ({
      from,
      to,
    })),
  };
}

export function reconcileMutableProviderConfig(params: {
  config: MutableDaemonConfig;
  removedProviders: readonly string[];
}): MutableDaemonConfig {
  const { config, removedProviders } = params;
  return omitMetadataGenerationProvidersFromConfig(
    omitProvidersFromConfig(config, removedProviders),
    removedProviders,
  );
}

export function applyMutableProviderConfigToOverrides(
  baseOverrides: Record<string, ProviderOverride> | undefined,
  mutableProviders: MutableDaemonConfig["providers"] | undefined,
): Record<string, ProviderOverride> | undefined {
  if (!baseOverrides && (!mutableProviders || Object.keys(mutableProviders).length === 0)) {
    return undefined;
  }

  const nextOverrides: Record<string, ProviderOverride> = { ...baseOverrides };
  for (const [providerId, providerConfig] of Object.entries(mutableProviders ?? {})) {
    nextOverrides[providerId] = {
      ...nextOverrides[providerId],
      ...ProviderOverrideSchema.strip().parse(providerConfig),
    };
  }

  return nextOverrides;
}

export function mergeProviderMutableStateIntoPersistedAgents(params: {
  persisted: PersistedConfig;
  mutable: MutableDaemonConfig;
  removeProviders: readonly string[];
  replaceProviders: readonly string[];
}): PersistedConfig["agents"] {
  const { persisted, mutable, removeProviders, replaceProviders } = params;
  const metadataGenerationProviders = readMetadataGenerationProviders(mutable);
  const persistedProviderOverrides = omitProvidersFromOverrides(
    persisted.agents?.providers as Record<string, ProviderOverride> | undefined,
    [...removeProviders, ...replaceProviders],
  );
  const providerOverrides = applyMutableProviderConfigToOverrides(
    persistedProviderOverrides,
    mutable.providers,
  );
  const persistedAgents = omitProvidersFromPersistedAgents(persisted.agents);
  const persistedMetadataGeneration = {
    providers: metadataGenerationProviders,
  };
  const shouldPersistMetadataGeneration =
    metadataGenerationProviders.length > 0 || persisted.agents?.metadataGeneration !== undefined;

  let nextAgents = persistedAgents as PersistedConfig["agents"];
  if (providerOverrides && Object.keys(providerOverrides).length > 0) {
    nextAgents = {
      ...persistedAgents,
      providers: providerOverrides,
      ...(shouldPersistMetadataGeneration
        ? { metadataGeneration: persistedMetadataGeneration }
        : {}),
    } as PersistedConfig["agents"];
  } else if (shouldPersistMetadataGeneration) {
    nextAgents = {
      ...persistedAgents,
      metadataGeneration: persistedMetadataGeneration,
    } as PersistedConfig["agents"];
  }

  return nextAgents;
}
