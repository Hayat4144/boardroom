import type Anthropic from "@anthropic-ai/sdk";
import { llmCalls, type Database } from "@boardroom/db";
import { createTestDb } from "@boardroom/db/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { runWithContext } from "../src/lib/requestContext";
import { AnthropicLLMClient } from "../src/llm/client";
import { estimateCostUsd } from "../src/llm/pricing";
import { createUser } from "./helpers";

let testDb: Awaited<ReturnType<typeof createTestDb>>;
let db: Database;

beforeAll(async () => {
  testDb = await createTestDb();
  db = testDb.db;
});
afterAll(() => testDb.close());
beforeEach(() => testDb.reset());

const params: Anthropic.MessageCreateParamsNonStreaming = {
  model: "claude-opus-5-5",
  max_tokens: 100,
  messages: [{ role: "user", content: "hi" }],
};

const message = {
  id: "msg_1",
  type: "message",
  role: "assistant",
  model: "claude-opus-5-5",
  content: [{ type: "text", text: "hello", citations: null }],
  stop_reason: "end_turn",
  stop_sequence: null,
  usage: {
    input_tokens: 1000,
    output_tokens: 200,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
  },
} as unknown as Anthropic.Message;

const fakeAnthropic = (create: () => Promise<unknown>) =>
  ({ messages: { create: vi.fn(create) } }) as unknown as Anthropic;

describe("AnthropicLLMClient", () => {
  it("returns the message and logs tokens, cost, latency, request and response", async () => {
    const user = await createUser(db);
    const client = new AnthropicLLMClient(
      fakeAnthropic(async () => message),
      db,
    );
    const result = await runWithContext({ userId: user.id }, () =>
      client.createMessage(params, { purpose: "ask" }),
    );
    expect(result).toBe(message);

    const [row] = await db.select().from(llmCalls);
    expect(row).toMatchObject({
      userId: user.id, // taken from the request context
      purpose: "ask",
      model: "claude-opus-5-5",
      inputTokens: 1000,
      outputTokens: 200,
      costUsd: "0.008000", // 1000 * $4/M + 200 * $20/M
    });
    expect(row!.latencyMs).toBeGreaterThanOrEqual(0);
    expect(row!.request).toEqual(params);
    expect((row!.response as { id: string }).id).toBe("msg_1");
  });

  it("logs failed calls and rethrows", async () => {
    const client = new AnthropicLLMClient(
      fakeAnthropic(async () => {
        throw new Error("overloaded");
      }),
      db,
    );
    await expect(
      client.createMessage(params, { purpose: "extract_promises", userId: null }),
    ).rejects.toThrow("overloaded");
    const [row] = await db.select().from(llmCalls);
    expect(row).toMatchObject({ purpose: "extract_promises", userId: null, inputTokens: null });
    expect(row!.response).toEqual({ error: { type: "Error", message: "overloaded" } });
  });
});

describe("estimateCostUsd", () => {
  it("prices cache reads and writes", () => {
    const cost = estimateCostUsd("claude-sonnet-5-5", {
      input_tokens: 1_000_000,
      output_tokens: 0,
      cache_creation_input_tokens: 1_000_000,
      cache_read_input_tokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(2 + 2.5 + 0.2);
  });

  it("returns null for unknown models", () => {
    expect(estimateCostUsd("some-other-model", { input_tokens: 1, output_tokens: 1 })).toBeNull();
  });
});
