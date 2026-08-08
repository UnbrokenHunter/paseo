import { z } from "zod";

// Domain model for issue #21: separates the concepts that the flat
// `provider` (execution) id used to conflate. Existing provider/profile ids
// stay the execution identity — a Binding wraps one unchanged, it never
// replaces it. See docs/data-model.md for how provider config is persisted
// today; this module only adds vocabulary on top, it does not change it.

export const IdentityConfidenceSchema = z.enum(["verified", "user-linked", "unknown"]);
export type IdentityConfidence = z.infer<typeof IdentityConfidenceSchema>;

// Who provides billing/access for a set of credentials (Anthropic, OpenAI,
// OpenRouter, ...). Distinct from ModelFamily: one access service can serve
// several model families (e.g. an OpenAI-compatible gateway serving GLM).
export const AccessServiceSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string().optional(),
});
export type AccessService = z.infer<typeof AccessServiceSchema>;

// The semantic model ecosystem (Claude, ChatGPT, Gemini, GLM, ...),
// independent of which access service or agent runtime serves it.
export const ModelFamilySchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string().optional(),
});
export type ModelFamily = z.infer<typeof ModelFamilySchema>;

// A model identity within a family, independent of the runtime-reported
// model id any single binding happens to use for it.
export const CanonicalModelSchema = z.object({
  id: z.string(),
  familyId: z.string(),
  label: z.string(),
  description: z.string().optional(),
});
export type CanonicalModel = z.infer<typeof CanonicalModelSchema>;

// A credential/identity within an access service.
export const AccountSchema = z.object({
  id: z.string(),
  accessServiceId: z.string(),
  label: z.string(),
  identityConfidence: IdentityConfidenceSchema,
  externalAccountId: z.string().nullable().optional(),
});
export type Account = z.infer<typeof AccountSchema>;

// Quota/plan ownership, kept separate from Account so one account can carry
// several entitlements (or an entitlement can be shared by several accounts
// once identity linking exists).
export const EntitlementSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  label: z.string(),
  planLabel: z.string().nullable().optional(),
});
export type Entitlement = z.infer<typeof EntitlementSchema>;

// The harness that executes a model (Claude Code, Codex, OpenCode, ...).
export const AgentRuntimeSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string().optional(),
});
export type AgentRuntime = z.infer<typeof AgentRuntimeSchema>;

// One configured runnable instance: an agent runtime paired with the
// access-service account that authenticates it. `id` is always the existing
// provider/profile id — Binding wraps the execution identity, it never
// mints a new one.
export const BindingSchema = z.object({
  id: z.string(),
  agentRuntimeId: z.string(),
  accessServiceId: z.string(),
  accountId: z.string(),
  label: z.string(),
  enabled: z.boolean(),
});
export type Binding = z.infer<typeof BindingSchema>;

// A capability resolution from a canonical model to the binding that can
// currently serve it. `modelId` is the runtime-facing model id to send that
// binding when using this route — distinct from `canonicalModelId`, which is
// runtime-independent.
export const RouteSchema = z.object({
  id: z.string(),
  canonicalModelId: z.string(),
  bindingId: z.string(),
  modelId: z.string(),
});
export type Route = z.infer<typeof RouteSchema>;
