import { AGENT_PROVIDER_DEFINITIONS } from "@getpaseo/protocol/provider-manifest";
import { describe, expect, it } from "vitest";

import {
  deriveAccessServices,
  deriveAccounts,
  deriveAgentRuntimes,
  deriveBindings,
  deriveCanonicalModels,
  deriveEntitlements,
  deriveModelFamilies,
  deriveRoutes,
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

describe("deriveModelFamilies", () => {
  it("returns the claude model family", () => {
    const families = deriveModelFamilies();
    expect(families.map((family) => family.id)).toEqual(["claude"]);
  });
});

describe("deriveCanonicalModels", () => {
  it("returns one canonical model per entry in the claude manifest", () => {
    const canonicalModels = deriveCanonicalModels();
    expect(canonicalModels.map((model) => model.id).sort()).toEqual(
      CLAUDE_MODEL_MANIFEST.map((model) => model.id).sort(),
    );
    expect(canonicalModels.every((model) => model.familyId === "claude")).toBe(true);
  });
});

describe("deriveRoutes", () => {
  it("routes the claude binding to every canonical claude model", () => {
    const [binding] = deriveBindings([claude]);
    const routes = deriveRoutes([binding]);
    expect(routes.map((route) => route.canonicalModelId).sort()).toEqual(
      CLAUDE_MODEL_MANIFEST.map((model) => model.id).sort(),
    );
    expect(routes.every((route) => route.bindingId === "claude")).toBe(true);
    expect(routes.every((route) => route.modelId === route.canonicalModelId)).toBe(true);
  });

  it("does not route a custom profile with a custom endpoint", () => {
    const [binding] = deriveBindings([zai]);
    expect(deriveRoutes([binding])).toEqual([]);
  });

  it("routes a same-endpoint profile to every canonical claude model under its own binding id", () => {
    const [binding] = deriveBindings([claudeTwo]);
    const routes = deriveRoutes([binding]);
    expect(routes.map((route) => route.canonicalModelId).sort()).toEqual(
      CLAUDE_MODEL_MANIFEST.map((model) => model.id).sort(),
    );
    expect(routes.every((route) => route.bindingId === "claude-two")).toBe(true);
  });
});
