import Anthropic from "@anthropic-ai/sdk";
import { getEnv } from "../config/env";
import { getDb } from "../db";
import { AnthropicLLMClient, type LLMClient } from "./client";

export { DEFAULT_MODEL, type LLMCallContext, type LLMClient } from "./client";

let client: LLMClient | undefined;

/** Shared LLM client; every call through it is logged to llm_calls. */
export function getLLMClient(): LLMClient {
  if (!client) {
    const apiKey = getEnv().LLM_API_KEY;
    if (!apiKey) throw new Error("LLM_API_KEY is not set");
    client = new AnthropicLLMClient(new Anthropic({ apiKey }), getDb());
  }
  return client;
}
