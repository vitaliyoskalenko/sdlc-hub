// API list prices, USD per million tokens, from https://platform.claude.com/docs/en/about-claude/pricing as read on
// 2026-10-08. A cost is an API-equivalent estimate, not an invoice: on seats the work is not billed per token. The
// admin overrides any model in .hub/config.yaml (prices). Not modelled: fast mode, US-only inference (1.1x), batch,
// and the higher Haiku 5.5 tier for prompts over 100,000 tokens.

export interface Price {
  input: number;
  cache_write_5m: number;
  cache_write_1h: number;
  cache_read: number;
  output: number;
}

export const PRICES_AS_OF = "2026-10-08";

/** By model id prefix; the longest matching prefix wins. */
export const DEFAULT_PRICES: Record<string, Price> = {
  "claude-fable-5-1": { input: 10, cache_write_5m: 12.5, cache_write_1h: 20, cache_read: 0.25, output: 50 },
  "claude-fable-5": { input: 10, cache_write_5m: 12.5, cache_write_1h: 20, cache_read: 1, output: 50 },
  "claude-opus-5-5": { input: 4, cache_write_5m: 5, cache_write_1h: 8, cache_read: 0.2, output: 20 },
  "claude-opus-5": { input: 5, cache_write_5m: 6.25, cache_write_1h: 10, cache_read: 0.5, output: 25 },
  "claude-opus-4": { input: 5, cache_write_5m: 6.25, cache_write_1h: 10, cache_read: 0.5, output: 25 },
  "claude-sonnet-5-5": { input: 2, cache_write_5m: 2.5, cache_write_1h: 4, cache_read: 0.1, output: 10 },
  "claude-sonnet-5": { input: 2, cache_write_5m: 2.5, cache_write_1h: 4, cache_read: 0.2, output: 10 },
  "claude-sonnet-4": { input: 3, cache_write_5m: 3.75, cache_write_1h: 6, cache_read: 0.3, output: 15 },
  "claude-haiku-5-5": { input: 0.1, cache_write_5m: 0.125, cache_write_1h: 0.2, cache_read: 0.01, output: 0.5 },
  "claude-haiku-4-5": { input: 1, cache_write_5m: 1.25, cache_write_1h: 2, cache_read: 0.1, output: 5 },
};

export interface Tokens {
  input: number;
  cache_write_5m: number;
  cache_write_1h: number;
  cache_read: number;
  output: number;
}

export const ZERO: Tokens = { input: 0, cache_write_5m: 0, cache_write_1h: 0, cache_read: 0, output: 0 };
export const addTokens = (a: Tokens, b: Tokens): Tokens => ({ input: a.input + b.input, cache_write_5m: a.cache_write_5m + b.cache_write_5m, cache_write_1h: a.cache_write_1h + b.cache_write_1h, cache_read: a.cache_read + b.cache_read, output: a.output + b.output });
export const totalTokens = (t: Tokens) => t.input + t.cache_write_5m + t.cache_write_1h + t.cache_read + t.output;

export function priceOf(model: string, overrides: Record<string, Price> = {}): Price | undefined {
  const table = { ...DEFAULT_PRICES, ...overrides };
  const key = Object.keys(table).filter((k) => model === k || model.startsWith(`${k}-`) || model.startsWith(k)).sort((a, b) => b.length - a.length)[0];
  return key ? table[key] : undefined;
}

/** USD, or undefined when the model has no price: its tokens still count, and the site says the price is missing. */
export function costOf(model: string, t: Tokens, overrides?: Record<string, Price>): number | undefined {
  const p = priceOf(model, overrides);
  if (!p) return undefined;
  return (t.input * p.input + t.cache_write_5m * p.cache_write_5m + t.cache_write_1h * p.cache_write_1h + t.cache_read * p.cache_read + t.output * p.output) / 1_000_000;
}
