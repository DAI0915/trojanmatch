import { describe, expect, it } from "vitest";
import { isAllowedOrigin } from "@/lib/api/origin";

const APP = "https://trojanmatch.example";
const h = (o: Record<string, string>) => ({ get: (k: string) => o[k.toLowerCase()] ?? null });

describe("isAllowedOrigin (CSRF guard)", () => {
  it("allows safe methods without Origin", () => {
    expect(isAllowedOrigin("GET", h({}), APP)).toBe(true);
    expect(isAllowedOrigin("HEAD", h({}), APP)).toBe(true);
  });
  it("allows same-origin POST", () => {
    expect(isAllowedOrigin("POST", h({ origin: APP }), APP)).toBe(true);
  });
  it("rejects cross-origin POST", () => {
    expect(isAllowedOrigin("POST", h({ origin: "https://evil.example" }), APP)).toBe(false);
  });
  it("rejects look-alike origins", () => {
    expect(isAllowedOrigin("POST", h({ origin: `${APP}.evil.example` }), APP)).toBe(false);
  });
  it("falls back to Referer, and rejects when both are missing", () => {
    expect(isAllowedOrigin("POST", h({ referer: `${APP}/spaces` }), APP)).toBe(true);
    expect(isAllowedOrigin("POST", h({ referer: "https://evil.example/x" }), APP)).toBe(false);
    expect(isAllowedOrigin("DELETE", h({}), APP)).toBe(false);
  });
  it("rejects malformed Referer", () => {
    expect(isAllowedOrigin("POST", h({ referer: "not a url" }), APP)).toBe(false);
  });
});
