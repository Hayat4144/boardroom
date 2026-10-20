import Anthropic from "@anthropic-ai/sdk";
import { llmCalls } from "@boardroom/db";
import { db } from "../db";
import { env } from "../env";

export const DEFAULT_MODEL = "claude-opus-5-5";

/** USD per 1M tokens (Anthropic API rates, 2026-10). Only used to fill llm_calls.cost_usd. */
const PRICES: Record<string, { input: number; output: number; cacheRead: number }> = {
  "claude-fable-5-1": { input: 10, output: 50, cacheRead: 0.25 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2 },

  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01 },
};

/** Cache writes (5-minute TTL) bill at 1.25x the input rate. */
const CACHE_WRITE_MULTIPLIER = 1.25;

export type TokenUsage = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;

  cache_read_input_tokens?: number | null;
};

export type LLMCallInfo = {
  /** What the call is for, e.g. "extract_promises" or "ask". Shown on the admin page. */
  purpose: string;
  /** The user who triggered the call, if any. */
  userId?: string | null;
};

let anthropic: Anthropic | undefined;

function getAnthropic(): Anthropic {
  if (!env.LLM_API_KEY) throw new Error("LLM_API_KEY is not set");

  anthropic ??= new Anthropic({ apiKey: env.LLM_API_KEY });
  return anthropic;
}

/**
 * Sends one request to the LLM and logs it to `llm_calls` (tokens, cost,
 * latency, full request/response), including failed calls.
 * No prompts and no agent logic live here; the caller builds `params`.
 */
export async function callLLM(
  params: Anthropic.MessageCreateParamsNonStreaming,
  { purpose, userId = null }: LLMCallInfo,
): Promise<Anthropic.Message> {
  const startedAt = Date.now();
  const latencyMs = () => Date.now() - startedAt;

  try {
    const message = await getAnthropic().messages.create(params);
    const { usage } = message;

    await logCall({
      userId,
      purpose,
      model: message.model,

      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      costUsd: estimateCostUsd(params.model, usage),

      latencyMs: latencyMs(),
      request: params,
      response: message,
    });

    return message;
  } catch (err) {
    await logCall({
      userId,
      purpose,
      model: params.model,

      latencyMs: latencyMs(),
      request: params,
      response: { error: describeError(err) },
    });

    throw err;
  }
}

/** Cost of one call in USD, or null for a model without a known price. */
export function estimateCostUsd(model: string, usage: TokenUsage): number | null {
  const price = PRICES[model];
  if (!price) return null;

  const cacheWrites = usage.cache_creation_input_tokens ?? 0;
  const cacheReads = usage.cache_read_input_tokens ?? 0;

  const perMillion =
    usage.input_tokens * price.input +
    usage.output_tokens * price.output +
    cacheWrites * price.input * CACHE_WRITE_MULTIPLIER +
    cacheReads * price.cacheRead;

  return perMillion / 1_000_000;
}

type LogRow = {
  userId: string | null;
  purpose: string;
  model: string;

  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number | null;

  latencyMs: number;
  request: unknown;
  response: unknown;
};

async function logCall(row: LogRow): Promise<void> {
  const costUsd = row.costUsd == null ? null : row.costUsd.toFixed(6);

  try {
    await db.insert(llmCalls).values({ ...row, costUsd });
  } catch (err) {
    // Never fail the LLM call because logging failed.
    console.error("[llm] failed to log call", err);
  }
}

function describeError(err: unknown) {
  if (!(err instanceof Error)) return { type: "unknown", message: String(err) };

  const status = (err as { status?: number }).status;
  return { type: err.name, message: err.message, ...(status ? { status } : {}) };
}
