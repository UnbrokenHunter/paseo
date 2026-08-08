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
  deriveCatalog,
  deriveEntitlements,
  type DiscoveredProviderModels,
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
  discovered: DiscoveredProviderModels[] = [],
): AccessModelSnapshot {
  const bindings = deriveBindings(providers);
  const catalog = deriveCatalog(bindings, discovered);
  return {
    agentRuntimes: deriveAgentRuntimes(),
    accessServices: deriveAccessServices(providers),
    accounts: deriveAccounts(providers),
    entitlements: deriveEntitlements(providers),
    bindings,
    modelFamilies: catalog.families,
    canonicalModels: catalog.canonicalModels,
    routes: catalog.routes,
  };
}
