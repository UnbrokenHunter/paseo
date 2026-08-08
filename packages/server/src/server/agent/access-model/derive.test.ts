import { AGENT_PROVIDER_DEFINITIONS } from "@getpaseo/protocol/provider-manifest";
import { describe, expect, it } from "vitest";

import {
  deriveAccessServices,
  deriveAccounts,
  deriveAgentRuntimes,
  deriveBindings,
  deriveCatalog,
  deriveEntitlements,
} from "./derive.js";
import { CLAUDE_MODEL_MANIFEST } from "../providers/claude/model-manifest.js";
import type { RegisteredProviderSummary } from "./registry-summary.js";

const claude: RegisteredProviderSummary = {
  providerId: "claude",
  label: "Claude Code",
  description: "Claude Code",
  enabled: true,
  derivedFromProviderId: null,
  hasCustomEndpoint: false,
  env: undefined,
};

const disabledCodex: RegisteredProviderSummary = {
  providerId: "codex",
  label: "Codex",
  description: "Codex",
  enabled: false,
  derivedFromProviderId: null,
  hasCustomEndpoint: false,
  env: undefined,
};

const zai: RegisteredProviderSummary = {
  providerId: "zai",
  label: "ZAI",
  description: "Claude with a Z.AI endpoint",
  enabled: true,
  derivedFromProviderId: "claude",
  hasCustomEndpoint: true,
  env: { ANTHROPIC_BASE_URL: "https://api.z.ai/api/anthropic" },
};

const qwen: RegisteredProviderSummary = {
  providerId: "qwen",
  label: "Qwen (Alibaba)",
  description: "Claude with a Qwen endpoint",
  enabled: true,
  derivedFromProviderId: "claude",
  hasCustomEndpoint: true,
  env: { ANTHROPIC_BASE_URL: "https://coding-intl.dashscope.aliyuncs.com/apps/anthropic" },
};

const opencode: RegisteredProviderSummary = {
  providerId: "opencode",
  label: "OpenCode",
  description: "OpenCode",
  enabled: true,
  derivedFromProviderId: null,
  hasCustomEndpoint: false,
  env: undefined,
};

const customAcp: RegisteredProviderSummary = {
  providerId: "my-acp",
  label: "My Custom ACP Agent",
  description: "A custom ACP agent with no canonical metadata",
  enabled: true,
  derivedFromProviderId: null,
  hasCustomEndpoint: false,
  env: undefined,
};

const claudeTwo: RegisteredProviderSummary = {
  providerId: "claude-two",
  label: "Claude · Claude-Two",
  description: "A second Anthropic account, same endpoint",
  enabled: true,
  derivedFromProviderId: "claude",
  hasCustomEndpoint: false,
  env: { CLAUDE_CONFIG_DIR: "/home/user/accounts/claude-two/.claude" },
};

describe("deriveAgentRuntimes", () => {
  it("returns one runtime per builtin provider definition", () => {
    const runtimes = deriveAgentRuntimes();
    expect(runtimes.map((runtime) => runtime.id).sort()).toEqual(
      AGENT_PROVIDER_DEFINITIONS.map((definition) => definition.id).sort(),
    );
  });
});

describe("deriveBindings", () => {
  it("binds a builtin provider to its own runtime and known access service", () => {
    const [binding] = deriveBindings([claude]);
    expect(binding).toEqual({
      id: "claude",
      agentRuntimeId: "claude",
      accessServiceId: "anthropic",
      accountId: "acct:claude",
      label: "Claude Code",
      enabled: true,
    });
  });

  it("carries enabled: false through from the registry", () => {
    const [binding] = deriveBindings([disabledCodex]);
    expect(binding.enabled).toBe(false);
  });

  it("binds a custom provider profile to its base runtime, not its own id", () => {
    const [binding] = deriveBindings([zai]);
    expect(binding.agentRuntimeId).toBe("claude");
    expect(binding.id).toBe("zai");
  });

  it("does not inherit the base runtime's access service for a custom profile with a custom endpoint", () => {
    const [binding] = deriveBindings([zai]);
    expect(binding.accessServiceId).toBe("unknown:zai");
    expect(binding.accessServiceId).not.toBe("anthropic");
  });

  it("inherits the base runtime's access service for a same-endpoint profile", () => {
    const [binding] = deriveBindings([claudeTwo]);
    expect(binding.agentRuntimeId).toBe("claude");
    expect(binding.id).toBe("claude-two");
    expect(binding.accessServiceId).toBe("anthropic");
  });
});

describe("deriveAccessServices", () => {
  it("dedupes known access services across providers", () => {
    const services = deriveAccessServices([claude, disabledCodex]);
    expect(services.map((service) => service.id).sort()).toEqual(["anthropic", "openai"]);
  });

  it("keeps unknown access services distinct per custom provider", () => {
    const services = deriveAccessServices([zai, qwen]);
    expect(services.map((service) => service.id).sort()).toEqual(["unknown:qwen", "unknown:zai"]);
  });

  it("dedupes a same-endpoint profile into its base runtime's access service", () => {
    const services = deriveAccessServices([claude, claudeTwo]);
    expect(services.map((service) => service.id)).toEqual(["anthropic"]);
  });
});

describe("deriveAccounts", () => {
  it("creates one unknown-confidence account per provider", () => {
    const accounts = deriveAccounts([claude, zai]);
    expect(accounts.map((account) => account.id).sort()).toEqual(["acct:claude", "acct:zai"]);
    expect(accounts.every((account) => account.identityConfidence === "unknown")).toBe(true);
  });

  it("scopes each account to the provider's resolved access service", () => {
    const [account] = deriveAccounts([zai]);
    expect(account.accessServiceId).toBe("unknown:zai");
  });

  it("scopes a same-endpoint profile's account to the base runtime's access service", () => {
    const [account] = deriveAccounts([claudeTwo]);
    expect(account.accessServiceId).toBe("anthropic");
  });
});

describe("deriveEntitlements", () => {
  it("creates one entitlement per account, pointed at that account", () => {
    const entitlements = deriveEntitlements([claude, claudeTwo]);
    expect(entitlements.map((entitlement) => entitlement.id).sort()).toEqual([
      "ent:claude",
      "ent:claude-two",
    ]);
    const [claudeEntitlement, claudeTwoEntitlement] = [...entitlements].sort((a, b) =>
      a.id.localeCompare(b.id),
    );
    expect(claudeEntitlement?.accountId).toBe("acct:claude");
    expect(claudeTwoEntitlement?.accountId).toBe("acct:claude-two");
  });

  it("never merges two bindings into one entitlement even when they share an access service", () => {
    // claude and claude-two both resolve to the "anthropic" access service
    // (see deriveAccessServices), but neither has verified or user-linked
    // identity evidence - each keeps its own entitlement.
    const entitlements = deriveEntitlements([claude, claudeTwo]);
    expect(entitlements).toHaveLength(2);
    expect(new Set(entitlements.map((entitlement) => entitlement.id)).size).toBe(2);
  });
});

describe("deriveCatalog - curated Claude manifest", () => {
  it("routes the claude binding to every canonical claude model", () => {
    const bindings = deriveBindings([claude]);
    const { routes, canonicalModels, families } = deriveCatalog(bindings);
    expect(routes.map((route) => route.canonicalModelId).sort()).toEqual(
      CLAUDE_MODEL_MANIFEST.map((model) => model.id).sort(),
    );
    expect(routes.every((route) => route.bindingId === "claude")).toBe(true);
    expect(routes.every((route) => route.modelId === route.canonicalModelId)).toBe(true);
    expect(canonicalModels.every((model) => model.familyId === "claude")).toBe(true);
    expect(families.map((family) => family.id)).toEqual(["claude"]);
  });

  it("gives a custom-endpoint profile no manifest routes of its own", () => {
    const bindings = deriveBindings([zai]);
    expect(deriveCatalog(bindings).routes).toEqual([]);
  });

  it("routes a same-endpoint profile under its own binding id", () => {
    const bindings = deriveBindings([claudeTwo]);
    const { routes } = deriveCatalog(bindings);
    expect(routes.map((route) => route.canonicalModelId).sort()).toEqual(
      CLAUDE_MODEL_MANIFEST.map((model) => model.id).sort(),
    );
    expect(routes.every((route) => route.bindingId === "claude-two")).toBe(true);
  });

  it("emits no routes for a disabled binding", () => {
    const bindings = deriveBindings([disabledCodex]);
    const { routes } = deriveCatalog(bindings, [
      { providerId: "codex", models: [{ id: "gpt-5", label: "GPT-5" }] },
    ]);
    expect(routes).toEqual([]);
  });
});

describe("deriveCatalog - runtime-discovered models", () => {
  it("routes a non-Claude runtime from its own discovered models", () => {
    const bindings = deriveBindings([opencode]);
    const { routes, canonicalModels, families } = deriveCatalog(bindings, [
      {
        providerId: "opencode",
        models: [
          { id: "openai/gpt-5", label: "GPT-5" },
          { id: "google/gemini-3-pro", label: "Gemini 3 Pro" },
        ],
      },
    ]);

    expect(routes).toHaveLength(2);
    expect(routes.every((route) => route.bindingId === "opencode")).toBe(true);
    // Canonical ids drop the vendor prefix; the Route keeps the exact
    // runtime id the harness will actually accept.
    expect(routes.map((route) => route.modelId).sort()).toEqual([
      "google/gemini-3-pro",
      "openai/gpt-5",
    ]);
    expect(canonicalModels.map((model) => model.id)).toEqual(
      expect.arrayContaining(["gpt-5", "gemini-3-pro"]),
    );
    expect(families.map((family) => family.id).sort()).toEqual(["gemini", "gpt"]);
  });

  it("collapses the same model reached through two runtimes into one canonical model", () => {
    const bindings = deriveBindings([claude, opencode]);
    const { routes, canonicalModels } = deriveCatalog(bindings, [
      { providerId: "claude", models: [{ id: "claude-opus-5", label: "Opus 5" }] },
      { providerId: "opencode", models: [{ id: "anthropic/claude-opus-5", label: "Opus 5" }] },
    ]);

    const opusRoutes = routes.filter((route) => route.canonicalModelId === "claude-opus-5");
    expect(opusRoutes.map((route) => route.bindingId).sort()).toEqual(["claude", "opencode"]);
    expect(opusRoutes.map((route) => route.modelId).sort()).toEqual([
      "anthropic/claude-opus-5",
      "claude-opus-5",
    ]);
    expect(canonicalModels.filter((model) => model.id === "claude-opus-5")).toHaveLength(1);
  });

  it("keeps an unrecognized model selectable under the Other family without inventing metadata", () => {
    const bindings = deriveBindings([customAcp]);
    const { routes, canonicalModels, families } = deriveCatalog(bindings, [
      { providerId: "my-acp", models: [{ id: "internal-frontier-v3" }] },
    ]);

    expect(routes).toHaveLength(1);
    expect(routes[0]?.modelId).toBe("internal-frontier-v3");
    const model = canonicalModels.find((entry) => entry.id === "internal-frontier-v3");
    expect(model?.familyId).toBe("unknown");
    // No label was reported, so the runtime id stands in rather than a
    // prettified guess.
    expect(model?.label).toBe("internal-frontier-v3");
    expect(model?.description).toBeUndefined();
    expect(families.map((family) => family.id)).toEqual(["unknown"]);
  });

  it("lets runtime discovery override the curated manifest's runtime model id", () => {
    const bindings = deriveBindings([claude]);
    const { routes } = deriveCatalog(bindings, [
      { providerId: "claude", models: [{ id: "claude-opus-5-latest", label: "Opus 5" }] },
    ]);

    // The manifest's own claude-opus-5 route survives (different canonical
    // id), and the newly discovered alias is routable too.
    expect(routes.some((route) => route.modelId === "claude-opus-5-latest")).toBe(true);
  });

  it("ignores the synthetic empty-id default model row", () => {
    const bindings = deriveBindings([opencode]);
    const { routes } = deriveCatalog(bindings, [
      { providerId: "opencode", models: [{ id: "", label: "Default" }] },
    ]);
    expect(routes).toEqual([]);
  });

  it("ignores discovered models for a provider with no binding", () => {
    const bindings = deriveBindings([claude]);
    const { routes } = deriveCatalog(bindings, [
      { providerId: "ghost", models: [{ id: "ghost-1", label: "Ghost" }] },
    ]);
    expect(routes.every((route) => route.bindingId === "claude")).toBe(true);
  });
});
