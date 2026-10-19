import { questions } from "@boardroom/db";
import { and, desc, eq } from "@boardroom/db/orm";
import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { answerQuestion } from "../agent/answerQuestion";
import { currentUser } from "../auth/middleware";
import { idParam, parse } from "../lib/http";
import type { AppDeps } from "./deps";
import { getCompanyOr404 } from "./lookups";

const askBody = z.object({ question: z.string().trim().min(3).max(2000) });

// Guards against a malformed return value from answerQuestion() reaching the DB.
const answerShape = z.object({
  answer: z.string(),
  citations: z.array(z.object({ filingId: z.string(), page: z.number().int(), quote: z.string() })),
});

const historyQuery = z.object({
  companyId: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const DAY_MS = 24 * 60 * 60 * 1000;

export function askRouter({ db, askDailyLimit }: AppDeps) {
  const router = Router();

  // Per-user limit to control LLM cost. In-memory: resets on restart and is
  // per-process, which is fine for a single API instance.
  const askLimiter = rateLimit({
    windowMs: DAY_MS,
    limit: askDailyLimit,
    keyGenerator: (req) => currentUser(req).id,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({
        error: "rate_limited",
        message: `You can ask ${askDailyLimit} questions per day. Try again later.`,
      });
    },
  });

  router.post("/companies/:id/ask", askLimiter, async (req, res) => {
    const user = currentUser(req);
    const { id } = parse(idParam, req.params);
    const { question } = parse(askBody, req.body);
    await getCompanyOr404(db, id);

    const result = answerShape.parse(await answerQuestion(id, question));
    const [saved] = await db
      .insert(questions)
      .values({
        userId: user.id,
        companyId: id,
        question,
        answer: result.answer,
        citations: result.citations,
      })
      .returning();
    res.status(201).json({ question: saved });
  });

  router.get("/questions", async (req, res) => {
    const user = currentUser(req);
    const { companyId, limit } = parse(historyQuery, req.query);
    const rows = await db
      .select()
      .from(questions)
      .where(
        and(
          eq(questions.userId, user.id),
          companyId ? eq(questions.companyId, companyId) : undefined,
        ),
      )
      .orderBy(desc(questions.createdAt))
      .limit(limit);
    res.json({ questions: rows });
  });

  return router;
}
