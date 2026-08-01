import { describe, expect, it } from "vitest";
import {
  hasLocalEndpoint,
  isLocalEndpointHostname,
  isLocalEndpointUrl,
} from "./local-endpoints.js";

describe("isLocalEndpointHostname", () => {
  it("accepts loopback names and addresses", () => {
    expect(isLocalEndpointHostname("localhost")).toBe(true);
    expect(isLocalEndpointHostname("LOCALHOST")).toBe(true);
    expect(isLocalEndpointHostname("127.0.0.1")).toBe(true);
    expect(isLocalEndpointHostname("127.1.2.3")).toBe(true);
    expect(isLocalEndpointHostname("[::1]")).toBe(true);
  });

  it("accepts private ranges, mDNS names, and the Docker host alias", () => {
    expect(isLocalEndpointHostname("10.0.0.4")).toBe(true);
    expect(isLocalEndpointHostname("192.168.1.20")).toBe(true);
    expect(isLocalEndpointHostname("172.16.0.1")).toBe(true);
    expect(isLocalEndpointHostname("172.31.255.254")).toBe(true);
    expect(isLocalEndpointHostname("workstation.local")).toBe(true);
    expect(isLocalEndpointHostname("host.docker.internal")).toBe(true);
  });

  it("rejects public hosts and the private-range near misses", () => {
    expect(isLocalEndpointHostname("api.anthropic.com")).toBe(false);
    expect(isLocalEndpointHostname("172.15.0.1")).toBe(false);
    expect(isLocalEndpointHostname("172.32.0.1")).toBe(false);
    expect(isLocalEndpointHostname("192.169.1.1")).toBe(false);
    expect(isLocalEndpointHostname("11.0.0.1")).toBe(false);
  });

  it("rejects malformed dotted quads rather than reading them as names", () => {
    expect(isLocalEndpointHostname("10.0.0")).toBe(false);
    expect(isLocalEndpointHostname("10.0.0.256")).toBe(false);
    expect(isLocalEndpointHostname("10.0.0.x")).toBe(false);
  });
});

describe("isLocalEndpointUrl", () => {
  it("reads the host out of a full endpoint URL", () => {
    expect(isLocalEndpointUrl("http://localhost:11434")).toBe(true);
    expect(isLocalEndpointUrl("http://127.0.0.1:1234/v1")).toBe(true);
    expect(isLocalEndpointUrl("  https://192.168.1.5:8080/v1  ")).toBe(true);
    expect(isLocalEndpointUrl("https://api.openai.com/v1")).toBe(false);
  });

  it("ignores values that are not http endpoints", () => {
    expect(isLocalEndpointUrl("sk-ant-not-a-url")).toBe(false);
    expect(isLocalEndpointUrl("file:///tmp/socket")).toBe(false);
    expect(isLocalEndpointUrl("")).toBe(false);
  });
});

describe("hasLocalEndpoint", () => {
  it("is true when any env value points somewhere local", () => {
    expect(
      hasLocalEndpoint({
        ANTHROPIC_API_KEY: "sk-ant-abc",
        ANTHROPIC_BASE_URL: "http://localhost:11434",
      }),
    ).toBe(true);
  });

  it("is false for a remote endpoint or no endpoint at all", () => {
    expect(hasLocalEndpoint({ ANTHROPIC_BASE_URL: "https://api.z.ai/api/anthropic" })).toBe(false);
    expect(hasLocalEndpoint({ ANTHROPIC_API_KEY: "sk-ant-abc" })).toBe(false);
    expect(hasLocalEndpoint(undefined)).toBe(false);
  });
});
