import type Anthropic from "@anthropic-ai/sdk";
import { llmCalls } from "@boardroom/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { callLLM, estimateCostUsd } from "../src/llm/llm";
import { createUser, testDb } from "./helpers";

vi.mock("../src/db", async () => ({ db: (await import("./helpers")).testDb.db }));

// Replace the Anthropic SDK so no request leaves the machine.
const create = vi.hoisted(() => vi.fn());
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create };
  },
}));

beforeEach(() => testDb.reset());

const params: Anthropic.MessageCreateParamsNonStreaming = {
  model: "claude-opus-5-5",
  max_tokens: 100,
  messages: [{ role: "user", content: "hi" }],
};

const message = {
  id: "msg_1",
  model: "claude-opus-5-5",
  content: [{ type: "text", text: "hello" }],

  usage: { input_tokens: 1000, output_tokens: 200 },
};

describe("callLLM", () => {
  it("returns the message and logs tokens, cost, latency, request and response", async () => {
    const user = await createUser();
    create.mockResolvedValueOnce(message);

    const result = await callLLM(params, { purpose: "ask", userId: user.id });
    expect(result).toBe(message);

    const [row] = await testDb.db.select().from(llmCalls);
    expect(row).toMatchObject({
      userId: user.id,
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
    create.mockRejectedValueOnce(new Error("overloaded"));
    await expect(callLLM(params, { purpose: "extract_promises" })).rejects.toThrow("overloaded");

    const [row] = await testDb.db.select().from(llmCalls);
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
