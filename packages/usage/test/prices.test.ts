import { describe, expect, it } from "vitest";
import { costOf, priceOf } from "../src/index.ts";

describe("API-equivalent cost", () => {
  it("prices each kind of token at the model's list price", () => {
    // 1M of each on Opus 5.5: 4 + 5 + 8 + 0.2 + 20.
    expect(costOf("claude-opus-5-5", { input: 1e6, cache_write_5m: 1e6, cache_write_1h: 1e6, cache_read: 1e6, output: 1e6 })).toBeCloseTo(37.2, 6);
  });
  it("matches a dated model id by its longest prefix, so Opus 5 and 5.5 differ", () => {
    expect(priceOf("claude-haiku-4-5-20251001")?.output).toBe(5);
    expect(priceOf("claude-opus-5-5")?.input).toBe(4);
    expect(priceOf("claude-opus-5")?.input).toBe(5);
  });
  it("takes the admin's prices first, and has none for an unknown model", () => {
    expect(priceOf("claude-opus-5-5", { "claude-opus-5-5": { input: 1, cache_write_5m: 1, cache_write_1h: 1, cache_read: 1, output: 1 } })?.output).toBe(1);
    expect(costOf("gpt-x", { input: 1, cache_write_5m: 0, cache_write_1h: 0, cache_read: 0, output: 0 })).toBeUndefined();
  });
});
