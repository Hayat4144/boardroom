import { llmCalls } from "@boardroom/db";
import { desc, eq, sql } from "@boardroom/db/orm";
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { requireAdmin } from "../auth/middleware";
import { db } from "../db";
import { idParam, notFound, parse } from "../http";

export const llmCallsRouter = Router();

llmCallsRouter.get("/llm-calls", requireAdmin, listLLMCalls);
llmCallsRouter.get("/llm-calls/:id", requireAdmin, getLLMCall);

const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

/** GET /llm-calls (admin) — recent calls without their bodies, plus all-time totals. */
async function listLLMCalls(req: Request, res: Response) {
  const { limit } = parse(listQuery, req.query);
  const [calls, totals] = await Promise.all([getRecentCalls(limit), getTotals()]);

  res.json({ calls, totals });
}

/** GET /llm-calls/:id (admin) — one call with its full request and response. */
async function getLLMCall(req: Request, res: Response) {
  const { id } = parse(idParam, req.params);
  const [call] = await db.select().from(llmCalls).where(eq(llmCalls.id, id));
  if (!call) throw notFound("LLM call");

  res.json({ call });
}

function getRecentCalls(limit: number) {
  return db
    .select({
      id: llmCalls.id,
      userId: llmCalls.userId,
      purpose: llmCalls.purpose,

      model: llmCalls.model,
      inputTokens: llmCalls.inputTokens,
      outputTokens: llmCalls.outputTokens,

      costUsd: llmCalls.costUsd,
      latencyMs: llmCalls.latencyMs,
      createdAt: llmCalls.createdAt,

      failed: sql<boolean>`coalesce(${llmCalls.response} ? 'error', false)`,
    })
    .from(llmCalls)
    .orderBy(desc(llmCalls.createdAt))
    .limit(limit);
}

async function getTotals() {
  const [totals] = await db
    .select({
      calls: sql<number>`count(*)::int`,
      costUsd: sql<string>`coalesce(sum(${llmCalls.costUsd}), 0)::text`,

      inputTokens: sql<number>`coalesce(sum(${llmCalls.inputTokens}), 0)::int`,
      outputTokens: sql<number>`coalesce(sum(${llmCalls.outputTokens}), 0)::int`,
    })
    .from(llmCalls);

  return totals;
}
