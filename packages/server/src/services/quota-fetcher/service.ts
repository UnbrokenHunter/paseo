import type { Logger } from "pino";
import type { ProviderUsage } from "../../server/messages.js";
import type {
  LocalProviderProfile,
  ProviderAccountProfile,
} from "../../server/daemon-config-store.js";
import { createProviderUsageAccountFetchers, createProviderUsageFetchers } from "./manifest.js";
import type { ProviderApiFetch, ProviderUsageFetcher } from "./provider.js";
import { unavailableUsage, unmeteredUsage } from "./usage.js";

export interface ProviderUsageServiceOptions {
  logger: Logger;
  fetchers?: ProviderUsageFetcher[];
  fetch?: ProviderApiFetch;
  cacheTtlMs?: number;
  now?: () => number;
  /**
   * Resolved per fetch rather than at construction, because accounts can be
   * added and removed while the daemon is running.
   */
  listAccountProfiles?: () => readonly ProviderAccountProfile[];
  /**
   * Providers pointed at a locally hosted model. No fetcher covers them, so they are
   * reported as unmetered rather than left out and shown as a failed lookup.
   */
  listLocalProviders?: () => readonly LocalProviderProfile[];
}

export interface ProviderUsageListResult {
  fetchedAt: string;
  providers: ProviderUsage[];
}

const DEFAULT_PROVIDER_USAGE_CACHE_TTL_MS = 5 * 60 * 1000;

export class ProviderUsageService {
  private readonly logger: Logger;
  private readonly fetchers: ProviderUsageFetcher[];
  private readonly fetch?: ProviderApiFetch;
  private readonly listAccountProfiles: () => readonly ProviderAccountProfile[];
  private readonly listLocalProviders: () => readonly LocalProviderProfile[];
  private readonly cacheTtlMs: number;
  private readonly now: () => number;
  private cached: { fetchedAtMs: number; result: ProviderUsageListResult } | null = null;
  private inFlight: Promise<ProviderUsageListResult> | null = null;
  private generation = 0;

  constructor(options: ProviderUsageServiceOptions) {
    this.logger = options.logger.child({ module: "provider-usage-service" });
    this.fetch = options.fetch;
    this.fetchers =
      options.fetchers ??
      createProviderUsageFetchers({
        logger: this.logger,
        fetch: options.fetch,
      });
    this.listAccountProfiles = options.listAccountProfiles ?? (() => []);
    this.listLocalProviders = options.listLocalProviders ?? (() => []);
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_PROVIDER_USAGE_CACHE_TTL_MS;
    this.now = options.now ?? Date.now;
  }

  /** Drops cached usage so an account added just now shows up immediately. */
  invalidate(): void {
    this.generation += 1;
    this.cached = null;
    this.inFlight = null;
  }

  async listUsage(options?: { forceRefresh?: boolean }): Promise<ProviderUsageListResult> {
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

    const generation = this.generation;
    const request = this.fetchFreshUsage(nowMs, generation);
    this.inFlight = request;
    try {
      return await request;
    } finally {
      if (this.inFlight === request) {
        this.inFlight = null;
      }
    }
  }

  private async fetchFreshUsage(
    nowMs: number,
    generation: number,
  ): Promise<ProviderUsageListResult> {
    const fetchers = [
      ...this.fetchers,
      ...createProviderUsageAccountFetchers(this.listAccountProfiles(), {
        logger: this.logger,
        fetch: this.fetch,
      }),
    ];
    const settled = await Promise.allSettled(fetchers.map((fetcher) => fetcher.fetchUsage()));
    const providers = settled.map((result, index) => {
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

    // Local providers are appended rather than fetched. A row already produced by a
    // fetcher wins, so extending a provider that does have a quota API and pointing it
    // at a proxy on localhost still reports that quota.
    const reported = new Set(providers.map((usage) => usage.providerId));
    const local = this.listLocalProviders()
      .filter((profile) => !reported.has(profile.providerId))
      .map((profile) =>
        unmeteredUsage({
          providerId: profile.providerId,
          displayName: profile.displayName,
          sourceLabel: profile.endpointLabel,
        }),
      );

    const result = {
      fetchedAt: new Date(nowMs).toISOString(),
      providers: [...providers, ...local],
    };
    if (generation === this.generation) {
      this.cached = { fetchedAtMs: nowMs, result };
    }
    return result;
  }
}
