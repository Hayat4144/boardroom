import { llmCalls } from "@boardroom/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { callLLM, type ChatParams } from "../src/llm/llm";
import { createUser, testDb } from "./helpers";

vi.mock("../src/db", async () => ({ db: (await import("./helpers")).testDb.db }));
vi.mock("../src/env", async (importOriginal) => {
  const { env } = await importOriginal<typeof import("../src/env")>();
  return { env: { ...env, LLM_API_KEY: "test-key" } };
});

// Replace the OpenAI SDK so no request leaves the machine.
const create = vi.hoisted(() => vi.fn());
vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create } };
  },
}));

beforeEach(() => testDb.reset());

const params: ChatParams = {
  model: "deepseek/deepseek-v4-flash",
  max_completion_tokens: 100,
  messages: [{ role: "user", content: "hi" }],
};

const completion = {
  id: "gen_1",
  model: "deepseek/deepseek-v4-flash",
  choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: "hello" } }],

  usage: { prompt_tokens: 1000, completion_tokens: 200, total_tokens: 1200, cost: 0.0008 },
};

describe("callLLM", () => {
  it("returns the completion and logs tokens, cost, latency, request and response", async () => {
    const user = await createUser();
    create.mockResolvedValueOnce(completion);

    const result = await callLLM(params, { purpose: "ask", userId: user.id });
    expect(result).toBe(completion);
    expect(create).toHaveBeenCalledWith({ ...params, usage: { include: true } });

    const [row] = await testDb.db.select().from(llmCalls);
    expect(row).toMatchObject({
      userId: user.id,
      purpose: "ask",
      model: "deepseek/deepseek-v4-flash",

      inputTokens: 1000,
      outputTokens: 200,
      costUsd: "0.000800",
    });

    expect(row!.latencyMs).toBeGreaterThanOrEqual(0);
    expect(row!.request).toEqual(params);
    expect((row!.response as { id: string }).id).toBe("gen_1");
  });

  it("logs failed calls and rethrows", async () => {
    create.mockRejectedValueOnce(new Error("overloaded"));
    await expect(callLLM(params, { purpose: "extract_promises" })).rejects.toThrow("overloaded");

    const [row] = await testDb.db.select().from(llmCalls);
    expect(row).toMatchObject({ purpose: "extract_promises", userId: null, inputTokens: null });
    expect(row!.response).toEqual({ error: { type: "Error", message: "overloaded" } });
  });
});
