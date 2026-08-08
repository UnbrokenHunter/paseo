import type { ModelFamily } from "@getpaseo/protocol/access-model";

/**
 * Model families recognized by pattern. Ordered: the first match wins, so
 * more specific patterns must come first. Labels optimize for user
 * recognition rather than legal entity names (issue #21: Settings groups
 * access under Anthropic/OpenAI/Google, the selector groups models under
 * Claude/ChatGPT/Gemini).
 */
const FAMILY_PATTERNS: ReadonlyArray<{ family: ModelFamily; pattern: RegExp }> = [
  { family: { id: "claude", label: "Claude" }, pattern: /(^|[^a-z])claude([^a-z]|$)/ },
  {
    family: { id: "gpt", label: "ChatGPT" },
    pattern: /(^|[^a-z])(gpt|o[134]|chatgpt|codex)([^a-z]|$)/,
  },
  { family: { id: "gemini", label: "Gemini" }, pattern: /(^|[^a-z])gemini([^a-z]|$)/ },
  { family: { id: "qwen", label: "Qwen" }, pattern: /(^|[^a-z])qwen([^a-z]|$)/ },
  { family: { id: "glm", label: "GLM" }, pattern: /(^|[^a-z])glm([^a-z]|$)/ },
  { family: { id: "deepseek", label: "DeepSeek" }, pattern: /(^|[^a-z])deepseek([^a-z]|$)/ },
  { family: { id: "kimi", label: "Kimi" }, pattern: /(^|[^a-z])(kimi|moonshot)([^a-z]|$)/ },
  { family: { id: "grok", label: "Grok" }, pattern: /(^|[^a-z])grok([^a-z]|$)/ },
  { family: { id: "llama", label: "Llama" }, pattern: /(^|[^a-z])llama([^a-z]|$)/ },
  {
    family: { id: "mistral", label: "Mistral" },
    pattern: /(^|[^a-z])(mistral|mixtral|codestral)([^a-z]|$)/,
  },
  { family: { id: "minimax", label: "MiniMax" }, pattern: /(^|[^a-z])minimax([^a-z]|$)/ },
];

/**
 * Family for models we cannot map to a known ecosystem. Deliberately one
 * shared bucket rather than a per-runtime family: "unknown" is a statement
 * about the model, and inventing a family per runtime would re-conflate
 * Agent Runtime with Model Family, which is exactly what issue #21 splits
 * apart.
 */
export const UNKNOWN_MODEL_FAMILY: ModelFamily = {
  id: "unknown",
  label: "Other",
  description: "Models Paseo could not map to a known family.",
};

/**
 * Runtime model ids carry vendor routing prefixes that differ per access
 * path for the same underlying model (`anthropic/claude-opus-5` through
 * OpenRouter vs `claude-opus-5` direct). Stripping the prefix is what lets
 * one canonical model own both, instead of the Model facet listing the
 * same model once per runtime.
 */
export function normalizeRuntimeModelId(runtimeModelId: string): string {
  const withoutPrefix = runtimeModelId.includes("/")
    ? (runtimeModelId.split("/").pop() ?? runtimeModelId)
    : runtimeModelId;
  return withoutPrefix.trim().toLowerCase();
}

/** The family a model belongs to, inferred from its id and label. */
export function inferModelFamily(runtimeModelId: string, modelLabel?: string): ModelFamily {
  const haystack = `${normalizeRuntimeModelId(runtimeModelId)} ${(modelLabel ?? "").toLowerCase()}`;
  for (const entry of FAMILY_PATTERNS) {
    if (entry.pattern.test(haystack)) {
      return entry.family;
    }
  }
  return UNKNOWN_MODEL_FAMILY;
}
