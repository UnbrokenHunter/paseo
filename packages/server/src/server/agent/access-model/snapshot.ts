import type {
  AccessService,
  Account,
  AgentRuntime,
  Binding,
  CanonicalModel,
  Entitlement,
  ModelFamily,
  Route,
} from "@getpaseo/protocol/access-model";

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
import type { RegisteredProviderSummary } from "./registry-summary.js";

export interface AccessModelSnapshot {
  agentRuntimes: AgentRuntime[];
  accessServices: AccessService[];
  accounts: Account[];
  entitlements: Entitlement[];
  bindings: Binding[];
  modelFamilies: ModelFamily[];
  canonicalModels: CanonicalModel[];
  routes: Route[];
}

export function buildAccessModelSnapshot(
  providers: RegisteredProviderSummary[],
): AccessModelSnapshot {
  const bindings = deriveBindings(providers);
  return {
    agentRuntimes: deriveAgentRuntimes(),
    accessServices: deriveAccessServices(providers),
    accounts: deriveAccounts(providers),
    entitlements: deriveEntitlements(providers),
    bindings,
    modelFamilies: deriveModelFamilies(),
    canonicalModels: deriveCanonicalModels(),
    routes: deriveRoutes(bindings),
  };
}
