/**
 * Providers pointed at a model you are hosting yourself.
 *
 * A local model has no quota, so no fetcher will ever produce a row for it and the
 * client would otherwise show "Usage unavailable" forever — indistinguishable from an
 * account whose limits failed to load. Detection is by endpoint rather than by an
 * allowlist of runtimes because Ollama, LM Studio, vLLM, llama.cpp and every wrapper
 * around them are configured the same way: a built-in provider extended with a base
 * URL in `env`. Which env var holds it varies by provider, so any value that parses as
 * an HTTP URL is considered.
 */

const LOCAL_HOSTNAMES = new Set(["localhost", "0.0.0.0", "::", "::1", "host.docker.internal"]);

function isPrivateIpv4(hostname: string): boolean {
  const octets = hostname.split(".");
  if (octets.length !== 4) return false;
  const parsed = octets.map((octet) => Number.parseInt(octet, 10));
  if (parsed.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return false;
  const [first, second] = parsed as [number, number, number, number];
  if (first === 10 || first === 127) return true;
  if (first === 192 && second === 168) return true;
  if (first === 172 && second >= 16 && second <= 31) return true;
  return false;
}

/** Loopback, RFC 1918, mDNS, and the Docker host alias. */
export function isLocalEndpointHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (LOCAL_HOSTNAMES.has(host)) return true;
  if (host.endsWith(".localhost") || host.endsWith(".local")) return true;
  if (host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd")) return true;
  return isPrivateIpv4(host);
}

export function isLocalEndpointUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  return isLocalEndpointHostname(url.hostname);
}

/** True when any env value points the provider at a locally hosted endpoint. */
export function hasLocalEndpoint(env: Record<string, string> | undefined): boolean {
  if (!env) return false;
  return Object.values(env).some((value) => typeof value === "string" && isLocalEndpointUrl(value));
}
