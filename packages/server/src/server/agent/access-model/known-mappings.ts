import type { AccessService, CanonicalModel, ModelFamily } from "@getpaseo/protocol/access-model";

import { CLAUDE_MODEL_MANIFEST } from "../providers/claude/model-manifest.js";

/**
 * Access service for a *builtin* runtime used unmodified. A custom provider
 * profile that `extends` one of these inherits the same access service only
 * when it doesn't redirect the endpoint (see BASE_URL_ENV_KEY_BY_BUILTIN_RUNTIME) —
 * that's Paseo's documented "multiple profiles for the same provider" pattern
 * (docs/custom-providers.md), e.g. two `extends: "claude"` profiles that only
 * differ by ANTHROPIC_API_KEY are two Anthropic accounts. A profile that also
 * sets ANTHROPIC_BASE_URL (Z.AI, Alibaba/Qwen, a proxy, ...) points at a
 * different backend, so the access service is no longer known and it falls
 * back to an unknown, per-provider access service instead.
 */
export const ACCESS_SERVICE_ID_BY_BUILTIN_RUNTIME: Record<string, string> = {
  claude: "anthropic",
  codex: "openai",
};

/**
 * The env var a profile sets to redirect a builtin runtime at a different
 * backend. Its presence in a profile's own declared env (not the merged
 * base+override env) is the signal that the profile is a different access
 * service rather than another account of the same one.
 */
export const BASE_URL_ENV_KEY_BY_BUILTIN_RUNTIME: Record<string, string> = {
  claude: "ANTHROPIC_BASE_URL",
  codex: "OPENAI_BASE_URL",
};

export const KNOWN_ACCESS_SERVICES: Record<string, AccessService> = {
  anthropic: { id: "anthropic", label: "Anthropic" },
  openai: { id: "openai", label: "OpenAI" },
};

export const CLAUDE_MODEL_FAMILY: ModelFamily = { id: "claude", label: "Claude" };

/**
 * Canonical models sourced from the curated Claude manifest (docs/providers.md:
 * Claude model metadata lives in model-manifest.ts and should not be
 * duplicated elsewhere). The canonical id reuses the manifest id directly —
 * Anthropic's own model ids are already vendor-level, not scoped to a Paseo
 * provider profile. Other runtimes report their models dynamically from a
 * live agent process, so they have no synchronous source to derive canonical
 * models from yet.
 */
export const CLAUDE_CANONICAL_MODELS: readonly CanonicalModel[] = CLAUDE_MODEL_MANIFEST.map(
  (model) => ({
    id: model.id,
    familyId: CLAUDE_MODEL_FAMILY.id,
    label: model.label,
    description: model.description,
  }),
);
