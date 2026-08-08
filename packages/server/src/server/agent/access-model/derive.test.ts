import { AGENT_PROVIDER_DEFINITIONS } from "@getpaseo/protocol/provider-manifest";
import { describe, expect, it } from "vitest";

import {
  deriveAccessServices,
  deriveAccounts,
  deriveAgentRuntimes,
  deriveBindings,
} from "./derive.js";
import type { RegisteredProviderSummary } from "./registry-summary.js";

const claude: RegisteredProviderSummary = {
  providerId: "claude",
  label: "Claude Code",
  description: "Claude Code",
  enabled: true,
  derivedFromProviderId: null,
};

const disabledCodex: RegisteredProviderSummary = {
  providerId: "codex",
  label: "Codex",
  description: "Codex",
  enabled: false,
  derivedFromProviderId: null,
};

const zai: RegisteredProviderSummary = {
  providerId: "zai",
  label: "ZAI",
  description: "Claude with a Z.AI endpoint",
  enabled: true,
  derivedFromProviderId: "claude",
};

const qwen: RegisteredProviderSummary = {
  providerId: "qwen",
  label: "Qwen (Alibaba)",
  description: "Claude with a Qwen endpoint",
  enabled: true,
  derivedFromProviderId: "claude",
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

  it("does not inherit the base runtime's access service for a custom profile", () => {
    const [binding] = deriveBindings([zai]);
    expect(binding.accessServiceId).toBe("unknown:zai");
    expect(binding.accessServiceId).not.toBe("anthropic");
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
});
