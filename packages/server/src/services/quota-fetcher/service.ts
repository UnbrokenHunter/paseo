import type { Logger } from "pino";
import type { RegisteredProviderSummary } from "../../server/agent/access-model/registry-summary.js";
import type { ProviderUsage } from "../../server/messages.js";
import { BINDING_AWARE_RUNTIME_IDS, buildBindingUsageFetchers } from "./binding-usage.js";
import { createProviderUsageFetchers } from "./manifest.js";
import type { ProviderApiFetch, ProviderUsageFetcher } from "./provider.js";
import { unavailableUsage } from "./usage.js";

export interface ProviderUsageServiceOptions {
  logger: Logger;
  fetchers?: ProviderUsageFetcher[];
  fetch?: ProviderApiFetch;
  cacheTtlMs?: number;
  now?: () => number;
}

export interface ProviderUsageListResult {
  fetchedAt: string;
  providers: ProviderUsage[];
}

const DEFAULT_PROVIDER_USAGE_CACHE_TTL_MS = 5 * 60 * 1000;

export class ProviderUsageService {
  private readonly logger: Logger;
  private readonly fetchApi: ProviderApiFetch | undefined;
  private readonly fetchers: ProviderUsageFetcher[];
  private readonly cacheTtlMs: number;
  private readonly now: () => number;
  private cached: { fetchedAtMs: number; result: ProviderUsageListResult } | null = null;
  private inFlight: Promise<ProviderUsageListResult> | null = null;

  constructor(options: ProviderUsageServiceOptions) {
    this.logger = options.logger.child({ module: "provider-usage-service" });
    this.fetchApi = options.fetch;
    this.fetchers =
      options.fetchers ??
      createProviderUsageFetchers({
        logger: this.logger,
        fetch: options.fetch,
      });
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_PROVIDER_USAGE_CACHE_TTL_MS;
    this.now = options.now ?? Date.now;
  }

  async listUsage(options?: {
    forceRefresh?: boolean;
    /**
     * When supplied, usage is fetched per binding for runtimes with a known
     * config-dir credential convention (see binding-usage.ts) instead of the
     * fixed single fetch per literal provider id. Omit to preserve the
     * original construction-time fetcher list (e.g. existing tests/callers
     * that don't have a provider registry to consult).
     */
    providers?: RegisteredProviderSummary[];
  }): Promise<ProviderUsageListResult> {
    const nowMs = this.now();
    if (
      !options?.forceRefresh &&
      this.cached &&
      nowMs - this.cached.fetchedAtMs < this.cacheTtlMs
    ) {
      return this.cached.result;
    }

    if (this.inFlight) {
      return this.inFlight;
    }

    const request = this.fetchFreshUsage(nowMs, options?.providers);
    this.inFlight = request;
    try {
      return await request;
    } finally {
      if (this.inFlight === request) {
        this.inFlight = null;
      }
    }
  }

  private resolveFetchers(
    providers: RegisteredProviderSummary[] | undefined,
  ): ProviderUsageFetcher[] {
    if (!providers) {
      return this.fetchers;
    }
    const bindingFetchers = buildBindingUsageFetchers(providers, {
      logger: this.logger,
      fetch: this.fetchApi,
    });
    const boundRuntimeIds = new Set(BINDING_AWARE_RUNTIME_IDS);
    const remainingFixedFetchers = this.fetchers.filter(
      (fetcher) => !boundRuntimeIds.has(fetcher.providerId),
    );
    return [...bindingFetchers, ...remainingFixedFetchers];
  }

  private async fetchFreshUsage(
    nowMs: number,
    providers: RegisteredProviderSummary[] | undefined,
  ): Promise<ProviderUsageListResult> {
    const fetchers = this.resolveFetchers(providers);
    const settled = await Promise.allSettled(fetchers.map((fetcher) => fetcher.fetchUsage()));
    const usage = settled.map((result, index) => {
      const fetcher = fetchers[index];
      if (result.status === "fulfilled") {
        return result.value;
      }
      this.logger.debug(
        { err: result.reason, providerId: fetcher.providerId },
        "Provider usage fetch failed",
      );
      return unavailableUsage({
        providerId: fetcher.providerId,
        displayName: fetcher.displayName,
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
    });

    const result = { fetchedAt: new Date(nowMs).toISOString(), providers: usage };
    this.cached = { fetchedAtMs: nowMs, result };
    return result;
  }
}
