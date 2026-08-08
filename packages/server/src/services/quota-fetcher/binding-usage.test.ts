import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RegisteredProviderSummary } from "../../server/agent/access-model/registry-summary.js";
import { buildBindingUsageFetchers } from "./binding-usage.js";

function createLogger() {
  const logger = {
    debug: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    child: () => logger,
  };
  return logger as never;
}

function providerSummary(overrides: Partial<RegisteredProviderSummary>): RegisteredProviderSummary {
  return {
    providerId: "claude",
    label: "Claude",
    description: "Claude",
    enabled: true,
    derivedFromProviderId: null,
    hasCustomEndpoint: false,
    env: undefined,
    ...overrides,
  };
}

function writeClaudeCredentials(dir: string, accessToken: string): void {
  writeFileSync(
    join(dir, ".credentials.json"),
    JSON.stringify({
      claudeAiOauth: {
        accessToken,
        refreshToken: "rt_test",
        subscriptionType: "pro",
        rateLimitTier: "default_1x",
      },
    }),
  );
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function twoAccountFetch(): typeof fetch {
  return vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
    const auth = new Headers(init?.headers).get("Authorization");
    if (auth === "Bearer token-personal") {
      return jsonResponse({ five_hour: { utilization: 10, resets_at: null } });
    }
    if (auth === "Bearer token-work") {
      return jsonResponse({ five_hour: { utilization: 90, resets_at: null } });
    }
    throw new Error(`Unexpected Authorization header: ${auth}`);
  }) as unknown as typeof fetch;
}

async function fetchAllUsage(fetchers: ReturnType<typeof buildBindingUsageFetchers>) {
  return Promise.all(fetchers.map((fetcher) => fetcher.fetchUsage()));
}

describe("buildBindingUsageFetchers", () => {
  it("skips disabled bindings", () => {
    const fetchers = buildBindingUsageFetchers(
      [providerSummary({ providerId: "claude", enabled: false })],
      { logger: createLogger() },
    );
    expect(fetchers).toHaveLength(0);
  });

  it("skips a derived profile that redirects the endpoint", () => {
    const fetchers = buildBindingUsageFetchers(
      [
        providerSummary({
          providerId: "zai",
          derivedFromProviderId: "claude",
          hasCustomEndpoint: true,
        }),
      ],
      { logger: createLogger() },
    );
    expect(fetchers).toHaveLength(0);
  });

  it("skips a base runtime with no known config-dir credential convention", () => {
    const fetchers = buildBindingUsageFetchers(
      [providerSummary({ providerId: "opencode", label: "OpenCode" })],
      { logger: createLogger() },
    );
    expect(fetchers).toHaveLength(0);
  });

  it("returns one fetcher per enabled binding, labeled with the binding's own identity", () => {
    const fetchers = buildBindingUsageFetchers(
      [
        providerSummary({ providerId: "claude", label: "Claude" }),
        providerSummary({
          providerId: "claude-two",
          label: "Claude · Claude-Two",
          derivedFromProviderId: "claude",
          env: { CLAUDE_CONFIG_DIR: "/tmp/does-not-matter" },
        }),
      ],
      { logger: createLogger() },
    );
    expect(fetchers.map((fetcher) => fetcher.providerId)).toEqual(["claude", "claude-two"]);
    expect(fetchers.map((fetcher) => fetcher.displayName)).toEqual([
      "Claude",
      "Claude · Claude-Two",
    ]);
  });

  let personalHome: string;
  let workHome: string;

  beforeEach(() => {
    personalHome = mkdtempSync(join(tmpdir(), "paseo-claude-personal-"));
    workHome = mkdtempSync(join(tmpdir(), "paseo-claude-work-"));
    writeClaudeCredentials(personalHome, "token-personal");
    writeClaudeCredentials(workHome, "token-work");
  });

  afterEach(() => {
    rmSync(personalHome, { recursive: true, force: true });
    rmSync(workHome, { recursive: true, force: true });
  });

  it("reads each binding's own credentials and tags the result with its binding id and base runtime", async () => {
    const fetchers = buildBindingUsageFetchers(
      [
        providerSummary({
          providerId: "claude",
          label: "Claude (Personal)",
          env: { CLAUDE_CONFIG_DIR: personalHome },
        }),
        providerSummary({
          providerId: "claude-work",
          label: "Claude (Work)",
          derivedFromProviderId: "claude",
          env: { CLAUDE_CONFIG_DIR: workHome },
        }),
      ],
      { logger: createLogger(), fetch: twoAccountFetch() },
    );

    const [personal, work] = await fetchAllUsage(fetchers);

    expect(personal?.providerId).toBe("claude");
    expect(personal?.runtimeId).toBe("claude");
    expect(personal?.windows[0]?.usedPct).toBe(10);

    expect(work?.providerId).toBe("claude-work");
    expect(work?.displayName).toBe("Claude (Work)");
    expect(work?.runtimeId).toBe("claude");
    expect(work?.windows[0]?.usedPct).toBe(90);
  });
});
