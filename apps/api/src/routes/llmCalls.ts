import { llmCalls } from "@boardroom/db";
import { desc, eq, sql } from "@boardroom/db/orm";
import { Router } from "express";
import { z } from "zod";
import { requireAdmin } from "../auth/middleware";
import { idParam, notFound, parse } from "../lib/http";
import type { AppDeps } from "./deps";

const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

export function llmCallsRouter({ db }: AppDeps) {
  const router = Router();
  router.use("/llm-calls", requireAdmin);

  router.get("/llm-calls", async (req, res) => {
    const { limit } = parse(listQuery, req.query);
    const [rows, [totals]] = await Promise.all([
      db
        .select({
          id: llmCalls.id,
          userId: llmCalls.userId,
          purpose: llmCalls.purpose,
          model: llmCalls.model,
          inputTokens: llmCalls.inputTokens,
          outputTokens: llmCalls.outputTokens,
          costUsd: llmCalls.costUsd,
          latencyMs: llmCalls.latencyMs,
          failed: sql<boolean>`coalesce(${llmCalls.response} ? 'error', false)`,
          createdAt: llmCalls.createdAt,
        })
        .from(llmCalls)
        .orderBy(desc(llmCalls.createdAt))
        .limit(limit),
      db
        .select({
          calls: sql<number>`count(*)::int`,
          costUsd: sql<string>`coalesce(sum(${llmCalls.costUsd}), 0)::text`,
          inputTokens: sql<number>`coalesce(sum(${llmCalls.inputTokens}), 0)::int`,
          outputTokens: sql<number>`coalesce(sum(${llmCalls.outputTokens}), 0)::int`,
        })
        .from(llmCalls),
    ]);
    res.json({ calls: rows, totals });
  });

  // Full request/response for one call.
  router.get("/llm-calls/:id", async (req, res) => {
    const { id } = parse(idParam, req.params);
    const [call] = await db.select().from(llmCalls).where(eq(llmCalls.id, id));
    if (!call) throw notFound("LLM call");
    res.json({ call });
  });

  return router;
}
