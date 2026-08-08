import type {
  AccessService,
  Account,
  AgentRuntime,
  Binding,
} from "@getpaseo/protocol/access-model";

import {
  deriveAccessServices,
  deriveAccounts,
  deriveAgentRuntimes,
  deriveBindings,
} from "./derive.js";
import type { RegisteredProviderSummary } from "./registry-summary.js";

export interface AccessModelSnapshot {
  agentRuntimes: AgentRuntime[];
  accessServices: AccessService[];
  accounts: Account[];
  bindings: Binding[];
}

export function buildAccessModelSnapshot(
  providers: RegisteredProviderSummary[],
): AccessModelSnapshot {
  return {
    agentRuntimes: deriveAgentRuntimes(),
    accessServices: deriveAccessServices(providers),
    accounts: deriveAccounts(providers),
    bindings: deriveBindings(providers),
  };
}
