import {
  loadPersistedConfig,
  savePersistedConfig,
  type PersistedConfig,
} from "./persisted-config.js";
import {
  mergeProviderMutableStateIntoPersistedAgents,
  planProviderConfigMutations,
  reconcileMutableProviderConfig,
  type ProviderRename,
} from "./daemon-config-provider-mutations.js";
import {
  MutableDaemonConfigSchema,
  MutableDaemonConfigPatchSchema,
} from "@getpaseo/protocol/messages";

export type { MutableDaemonConfig, MutableDaemonConfigPatch } from "@getpaseo/protocol/messages";
export { applyMutableProviderConfigToOverrides } from "./daemon-config-provider-mutations.js";
export { type ProviderRename } from "./daemon-config-provider-mutations.js";

type MutableDaemonConfig = import("@getpaseo/protocol/messages").MutableDaemonConfig;
type MutableDaemonConfigPatch = import("@getpaseo/protocol/messages").MutableDaemonConfigPatch;

interface LoggerLike {
  child(bindings: Record<string, unknown>): LoggerLike;
  info(...args: unknown[]): void;
}

export interface DaemonConfigChangeDetails {
  removedProviders: readonly string[];
  replacedProviders: readonly string[];
  renamedProviders: readonly ProviderRename[];
}

type ConfigListener = (config: MutableDaemonConfig, details: DaemonConfigChangeDetails) => void;
type FieldChangeHandler = (value: unknown) => void;

interface AppliedFieldChange {
  handler: FieldChangeHandler;
  previousValue: unknown;
}

function getLogger(logger: LoggerLike | undefined): LoggerLike | undefined {
  return logger?.child({ module: "daemon-config-store" });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepMerge<T extends Record<string, unknown>>(
  current: T,
  patch: Record<string, unknown>,
): T {
  const next: Record<string, unknown> = { ...current };

  for (const [key, patchValue] of Object.entries(patch)) {
    if (patchValue === undefined) {
      continue;
    }
    const currentValue = next[key];
    if (isRecord(currentValue) && isRecord(patchValue)) {
      next[key] = deepMerge(currentValue, patchValue);
      continue;
    }
    next[key] = patchValue;
  }

  return next as T;
}

function getValueAtPath(config: MutableDaemonConfig, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>((value, segment) => (isRecord(value) ? value[segment] : undefined), config);
}

function isEqualValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export class DaemonConfigStore {
  private current: MutableDaemonConfig;
  private readonly paseoHome: string;
  private readonly logger: LoggerLike | undefined;
  private readonly changeListeners = new Set<ConfigListener>();
  private readonly fieldChangeHandlers = new Map<string, Set<FieldChangeHandler>>();
  private readonly relayEnabledMutable: boolean;

  constructor(
    paseoHome: string,
    initial: MutableDaemonConfig,
    logger?: LoggerLike,
    options: { relayEnabledMutable?: boolean } = {},
  ) {
    this.paseoHome = paseoHome;
    this.logger = getLogger(logger);
    this.current = MutableDaemonConfigSchema.parse({
      ...initial,
      relay: initial.relay ?? { enabled: true },
    });
    this.relayEnabledMutable = options.relayEnabledMutable ?? true;
  }

  public get(): MutableDaemonConfig {
    return this.current;
  }

  public patch(partial: MutableDaemonConfigPatch): MutableDaemonConfig {
    const parsedPatch = MutableDaemonConfigPatchSchema.parse(partial);
    if (parsedPatch.relay?.enabled !== undefined && !this.relayEnabledMutable) {
      throw new Error(
        "Relay is controlled by a daemon launch override. Remove PASEO_RELAY_ENABLED or the relay CLI flag before changing it here.",
      );
    }
    const { mergePatch, removedProviders, replacedProviders, renamedProviders } =
      planProviderConfigMutations(parsedPatch);
    const merged = deepMerge(
      reconcileMutableProviderConfig({
        config: this.current,
        removedProviders: replacedProviders,
      }),
      mergePatch,
    );
    const next = MutableDaemonConfigSchema.parse(
      reconcileMutableProviderConfig({
        config: merged,
        removedProviders,
      }),
    );

    const changedFieldPaths = Array.from(this.fieldChangeHandlers.keys()).filter((path) => {
      return !isEqualValue(getValueAtPath(this.current, path), getValueAtPath(next, path));
    });
    const configChanged = !isEqualValue(this.current, next);

    if (!configChanged && removedProviders.length === 0 && replacedProviders.length === 0) {
      return this.current;
    }

    const persistedBeforePatch = this.persistConfig(next, removedProviders, replacedProviders);
    if (!configChanged) {
      const changeDetails: DaemonConfigChangeDetails = {
        removedProviders,
        replacedProviders,
        renamedProviders,
      };
      for (const listener of this.changeListeners) {
        listener(next, changeDetails);
      }
      return this.current;
    }

    const previous = this.current;
    const appliedFieldChanges: AppliedFieldChange[] = [];
    this.current = next;
    try {
      for (const path of changedFieldPaths) {
        const handlers = this.fieldChangeHandlers.get(path);
        if (!handlers) {
          continue;
        }
        const value = getValueAtPath(next, path);
        const previousValue = getValueAtPath(previous, path);
        for (const handler of handlers) {
          appliedFieldChanges.push({ handler, previousValue });
          handler(value);
        }
      }
    } catch (error) {
      this.current = previous;
      for (const change of appliedFieldChanges.toReversed()) {
        change.handler(change.previousValue);
      }
      savePersistedConfig(this.paseoHome, persistedBeforePatch, this.logger);
      throw error;
    }

    const changeDetails: DaemonConfigChangeDetails = {
      removedProviders,
      replacedProviders,
      renamedProviders,
    };
    for (const listener of this.changeListeners) {
      listener(next, changeDetails);
    }

    return next;
  }

  public onFieldChange(path: string, handler: FieldChangeHandler): () => void {
    const handlers = this.fieldChangeHandlers.get(path) ?? new Set<FieldChangeHandler>();
    handlers.add(handler);
    this.fieldChangeHandlers.set(path, handlers);

    return () => {
      const currentHandlers = this.fieldChangeHandlers.get(path);
      if (!currentHandlers) {
        return;
      }
      currentHandlers.delete(handler);
      if (currentHandlers.size === 0) {
        this.fieldChangeHandlers.delete(path);
      }
    };
  }

  public onChange(listener: ConfigListener): () => void {
    this.changeListeners.add(listener);
    return () => {
      this.changeListeners.delete(listener);
    };
  }

  private persistConfig(
    config: MutableDaemonConfig,
    removeProviders: readonly string[],
    replaceProviders: readonly string[],
  ): PersistedConfig {
    const persisted = loadPersistedConfig(this.paseoHome, this.logger);
    const nextPersisted = mergeMutableConfigIntoPersistedConfig({
      persisted,
      mutable: config,
      removeProviders,
      replaceProviders,
      persistRelayEnabled: this.relayEnabledMutable,
    });
    savePersistedConfig(this.paseoHome, nextPersisted, this.logger);
    return persisted;
  }
}

function mergeMutableConfigIntoPersistedConfig(params: {
  persisted: PersistedConfig;
  mutable: MutableDaemonConfig;
  removeProviders: readonly string[];
  replaceProviders: readonly string[];
  persistRelayEnabled: boolean;
}): PersistedConfig {
  const { persisted, mutable, removeProviders, replaceProviders, persistRelayEnabled } = params;
  if (!mutable.relay) {
    throw new Error("Mutable daemon config is missing relay state");
  }
  const browserToolsEnabled = readBrowserToolsEnabled(mutable);
  const nextAgents = mergeProviderMutableStateIntoPersistedAgents({
    persisted,
    mutable,
    removeProviders,
    replaceProviders,
  });

  return {
    ...persisted,
    daemon: {
      ...persisted.daemon,
      ...(persistRelayEnabled
        ? {
            relay: {
              ...persisted.daemon?.relay,
              enabled: mutable.relay.enabled,
            },
          }
        : {}),
      mcp: {
        ...persisted.daemon?.mcp,
        injectIntoAgents: mutable.mcp.injectIntoAgents,
      },
      browserTools: {
        ...persisted.daemon?.browserTools,
        enabled: browserToolsEnabled,
      },
      autoArchiveAfterMerge: mutable.autoArchiveAfterMerge,
      enableTerminalAgentHooks: mutable.enableTerminalAgentHooks,
      appendSystemPrompt: mutable.appendSystemPrompt,
      ...(mutable.terminalProfiles !== undefined
        ? { terminalProfiles: mutable.terminalProfiles }
        : {}),
    },
    agents: nextAgents,
  } as PersistedConfig;
}

function readBrowserToolsEnabled(mutable: MutableDaemonConfig): boolean {
  const browserTools = mutable.browserTools;
  if (!isRecord(browserTools)) {
    return false;
  }
  return browserTools["enabled"] === true;
}
