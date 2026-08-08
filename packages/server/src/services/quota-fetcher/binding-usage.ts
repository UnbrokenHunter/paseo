import type { Logger } from "pino";
import { CONFIG_DIR_ENV_KEY_BY_BUILTIN_RUNTIME } from "../../server/agent/access-model/known-mappings.js";
import type { RegisteredProviderSummary } from "../../server/agent/access-model/registry-summary.js";
import type { ProviderUsage } from "../../server/messages.js";
import { ClaudeQuotaProvider } from "./providers/claude.js";
import { CodexQuotaProvider } from "./providers/codex.js";
import type { ProviderApiFetch, ProviderUsageFetcher } from "./provider.js";

interface ConfigurableFetcherOptions {
  logger: Logger;
  fetch?: ProviderApiFetch;
  configDir?: string;
}

/**
 * Base runtimes whose native credential storage is a config-dir env var
 * (see CONFIG_DIR_ENV_KEY_BY_BUILTIN_RUNTIME) and whose usage fetcher
 * constructor already accepts that dir as an override. Other manifest
 * fetchers (copilot, cursor, zai, grok, kimi, minimax) have no known
 * per-binding credential path yet and keep using the fixed single fetch
 * per literal provider id.
 */
const CONFIGURABLE_RUNTIME_FETCHERS: Record<
  string,
  (options: ConfigurableFetcherOptions) => ProviderUsageFetcher
> = {
  claude: (options) =>
    new ClaudeQuotaProvider({
      logger: options.logger,
      fetch: options.fetch,
      claudeHome: options.configDir,
    }),
  codex: (options) =>
    new CodexQuotaProvider({
      logger: options.logger,
      fetch: options.fetch,
      codexHome: options.configDir,
    }),
};

/** Base runtime ids that buildBindingUsageFetchers sources fetchers for. */
export const BINDING_AWARE_RUNTIME_IDS: readonly string[] = Object.keys(
  CONFIGURABLE_RUNTIME_FETCHERS,
);

function resolveConfigDir(
  baseRuntimeId: string,
  provider: RegisteredProviderSummary,
): string | undefined {
  const envKey = CONFIG_DIR_ENV_KEY_BY_BUILTIN_RUNTIME[baseRuntimeId];
  if (!envKey) {
    return undefined;
  }
  return provider.env?.[envKey];
}

function withBindingIdentity(
  fetcher: ProviderUsageFetcher,
  binding: { providerId: string; displayName: string; runtimeId: string },
): ProviderUsageFetcher {
  return {
    providerId: binding.providerId,
    displayName: binding.displayName,
    async fetchUsage(): Promise<ProviderUsage> {
      const usage = await fetcher.fetchUsage();
      return {
        ...usage,
        providerId: binding.providerId,
        displayName: binding.displayName,
        runtimeId: binding.runtimeId,
      };
    },
  };
}

/**
 * One usage fetcher per enabled binding whose base runtime has a known
 * config-dir credential convention, parameterized with that binding's own
 * resolved config dir so two accounts of the same runtime (e.g. claude and
 * claude-two) each read their own credentials instead of always reading the
 * daemon's default ~/.claude or ~/.codex.
 *
 * A profile that redirects the endpoint entirely (hasCustomEndpoint, e.g. a
 * Z.AI or Alibaba profile extending "claude") is excluded here — it doesn't
 * serve Anthropic's usage API, and it already gets its own fetch attempt
 * from the fixed manifest list when its literal provider id matches one
 * (e.g. "zai").
 */
export function buildBindingUsageFetchers(
  providers: RegisteredProviderSummary[],
  options: { logger: Logger; fetch?: ProviderApiFetch },
): ProviderUsageFetcher[] {
  const fetchers: ProviderUsageFetcher[] = [];
  for (const provider of providers) {
    if (!provider.enabled) {
      continue;
    }
    if (provider.derivedFromProviderId !== null && provider.hasCustomEndpoint) {
      continue;
    }
    const baseRuntimeId = provider.derivedFromProviderId ?? provider.providerId;
    const factory = CONFIGURABLE_RUNTIME_FETCHERS[baseRuntimeId];
    if (!factory) {
      continue;
    }
    const configDir = resolveConfigDir(baseRuntimeId, provider);
    const inner = factory({ logger: options.logger, fetch: options.fetch, configDir });
    fetchers.push(
      withBindingIdentity(inner, {
        providerId: provider.providerId,
        displayName: provider.label,
        runtimeId: baseRuntimeId,
      }),
    );
  }
  return fetchers;
}
