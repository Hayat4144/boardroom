import { llmCalls } from "@boardroom/db";
import OpenAI from "openai";
import { db } from "../db";
import { env } from "../env";

export const DEFAULT_MODEL = "deepseek/deepseek-v4-flash";

/** Long transcripts can take a while to generate; the SDK retries timeouts twice. */
const TIMEOUT_MS = 120_000;

export type ChatParams = OpenAI.Chat.ChatCompletionCreateParamsNonStreaming;
export type ChatCompletion = OpenAI.Chat.ChatCompletion;

export type LLMCallInfo = {
  /** What the call is for, e.g. "extract_promises" or "ask". Shown on the admin page. */
  purpose: string;
  /** The user who triggered the call, if any. */
  userId?: string | null;
};

let client: OpenAI | undefined;

function getClient(): OpenAI {
  if (!env.LLM_API_KEY) throw new Error("LLM_API_KEY is not set");

  client ??= new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: env.LLM_API_KEY,
    timeout: TIMEOUT_MS,
  });
  return client;
}

/**
 * Sends one chat completion through OpenRouter and logs it to `llm_calls`
 * (tokens, cost, latency, full request/response), including failed calls.
 * No prompts and no agent logic live here; the caller builds `params`.
 */
export async function callLLM(
  params: ChatParams,
  { purpose, userId = null }: LLMCallInfo,
): Promise<ChatCompletion> {
  const startedAt = Date.now();
  const latencyMs = () => Date.now() - startedAt;

  // OpenRouter-only flag: puts the billed cost (USD) on `usage.cost`.
  const request = { ...params, usage: { include: true } } as ChatParams;

  try {
    const completion = await getClient().chat.completions.create(request);
    const usage = completion.usage as (OpenAI.CompletionUsage & { cost?: number }) | undefined;

    await logCall({
      userId,
      purpose,
      model: completion.model,

      inputTokens: usage?.prompt_tokens,
      outputTokens: usage?.completion_tokens,
      costUsd: usage?.cost ?? null,

      latencyMs: latencyMs(),
      request: params,
      response: completion,
    });

    return completion;
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
