import type { AccessService } from "@getpaseo/protocol/access-model";

/**
 * Access service for a *builtin* runtime used unmodified. A custom provider
 * profile that merely `extends` one of these (e.g. a Z.AI profile extending
 * "claude") is not covered here — pointing a builtin runtime at a different
 * base URL/backend means the access service is no longer known, so those
 * profiles fall back to an unknown, per-provider access service instead of
 * silently inheriting the base runtime's.
 */
export const ACCESS_SERVICE_ID_BY_BUILTIN_RUNTIME: Record<string, string> = {
  claude: "anthropic",
  codex: "openai",
};

export const KNOWN_ACCESS_SERVICES: Record<string, AccessService> = {
  anthropic: { id: "anthropic", label: "Anthropic" },
  openai: { id: "openai", label: "OpenAI" },
};
