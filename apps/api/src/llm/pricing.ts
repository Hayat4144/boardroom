/**
 * USD per 1M tokens, Anthropic first-party API rates (as of 2026-10).
 * Used only to fill llm_calls.cost_usd; update when prices change.
 */
interface ModelPrice {
  input: number;
  output: number;
  cacheRead: number;
}

const PRICES: Record<string, ModelPrice> = {
  "claude-fable-5-1": { input: 10, output: 50, cacheRead: 0.25 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01 },
};

/** Cache writes (5-minute TTL) bill at 1.25x the input rate. */
const CACHE_WRITE_MULTIPLIER = 1.25;

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

/** Returns null for models without a known price. */
export function estimateCostUsd(model: string, usage: TokenUsage): number | null {
  const price = PRICES[model];
  if (!price) return null;
  const perToken = (perMillion: number) => perMillion / 1_000_000;
  return (
    usage.input_tokens * perToken(price.input) +
    usage.output_tokens * perToken(price.output) +
    (usage.cache_creation_input_tokens ?? 0) * perToken(price.input) * CACHE_WRITE_MULTIPLIER +
    (usage.cache_read_input_tokens ?? 0) * perToken(price.cacheRead)
  );
}
