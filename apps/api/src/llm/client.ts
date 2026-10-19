import Anthropic from "@anthropic-ai/sdk";
import { llmCalls, type Database } from "@boardroom/db";
import { getRequestContext } from "../lib/requestContext";
import { estimateCostUsd } from "./pricing";

export const DEFAULT_MODEL = "claude-opus-5-5";

export interface LLMCallContext {
  /** What the call is for, e.g. "extract_promises", "ask". Shown on the admin page. */
  purpose: string;
  /** Defaults to the user of the current HTTP request, if any. */
  userId?: string | null;
}

/**
 * Thin wrapper around the provider API. Every call is logged to `llm_calls`
 * (tokens, cost, latency, full request/response) — including failed calls.
 * It contains no prompts and no agent logic; callers build the request.
 */
export interface LLMClient {
  createMessage(
    params: Anthropic.MessageCreateParamsNonStreaming,
    ctx: LLMCallContext,
  ): Promise<Anthropic.Message>;
}

export class AnthropicLLMClient implements LLMClient {
  constructor(
    private readonly anthropic: Anthropic,
    private readonly db: Database,
  ) {}

  async createMessage(params: Anthropic.MessageCreateParamsNonStreaming, ctx: LLMCallContext) {
    const userId = ctx.userId !== undefined ? ctx.userId : (getRequestContext()?.userId ?? null);
    const started = performance.now();
    try {
      const message = await this.anthropic.messages.create(params);
      await this.log({
        userId,
        purpose: ctx.purpose,
        model: message.model,
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
        costUsd: estimateCostUsd(params.model, message.usage),
        latencyMs: Math.round(performance.now() - started),
        request: params,
        response: message,
      });
      return message;
    } catch (err) {
      await this.log({
        userId,
        purpose: ctx.purpose,
        model: params.model,
        latencyMs: Math.round(performance.now() - started),
        request: params,
        response: { error: serializeError(err) },
      });
      throw err;
    }
  }

  private async log(row: {
    userId: string | null;
    purpose: string;
    model: string;
    inputTokens?: number;
    outputTokens?: number;
    costUsd?: number | null;
    latencyMs: number;
    request: unknown;
    response: unknown;
  }) {
    try {
      await this.db.insert(llmCalls).values({
        ...row,
        costUsd: row.costUsd == null ? null : row.costUsd.toFixed(6),
      });
    } catch (err) {
      // Never fail the LLM call because logging failed.
      console.error("[llm] failed to log call", err);
    }
  }
}

function serializeError(err: unknown) {
  if (err instanceof Anthropic.APIError) {
    return { type: err.name, status: err.status, message: err.message };
  }
  if (err instanceof Error) return { type: err.name, message: err.message };
  return { type: "unknown", message: String(err) };
}
