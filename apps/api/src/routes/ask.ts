import { questions } from "@boardroom/db";
import { and, desc, eq } from "@boardroom/db/orm";
import { Router, type Request, type Response } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { answerQuestion } from "../agent/answerQuestion";
import { currentUser } from "../auth/middleware";
import { db } from "../db";
import { env } from "../env";
import { idParam, parse } from "../http";
import { findCompany } from "../services/companies";

// Per-user daily limit to control LLM cost. Kept in memory, so it resets on
// restart; fine for a single API process.
const askLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  limit: env.ASK_DAILY_LIMIT,
  keyGenerator: (req) => currentUser(req).id,

  standardHeaders: "draft-8",
  legacyHeaders: false,

  handler: (_req, res) => {
    const message = `You can ask ${env.ASK_DAILY_LIMIT} questions per day. Try again later.`;
    res.status(429).json({ error: "rate_limited", message });
  },
});

export const askRouter = Router();

askRouter.post("/companies/:id/ask", askLimiter, ask);
askRouter.get("/questions", listMyQuestions);

const askBody = z.object({ question: z.string().trim().min(3).max(2000) });

// Guards against a malformed return value from answerQuestion() reaching the DB.
const answerSchema = z.object({
  answer: z.string(),
  citations: z.array(z.object({ filingId: z.string(), page: z.number().int(), quote: z.string() })),
});

const historyQuery = z.object({
  companyId: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

/** POST /companies/:id/ask { question } — answers via HAYAT's answerQuestion() and saves it. */
async function ask(req: Request, res: Response) {
  const user = currentUser(req);
  const { id } = parse(idParam, req.params);
  const { question } = parse(askBody, req.body);

  await findCompany(id);
  const { answer, citations } = answerSchema.parse(await answerQuestion(id, question));

  const [saved] = await db
    .insert(questions)
    .values({ userId: user.id, companyId: id, question, answer, citations })
    .returning();

  res.status(201).json({ question: saved });
}

/** GET /questions?companyId= — only the current user's own history. */
async function listMyQuestions(req: Request, res: Response) {
  const user = currentUser(req);
  const { companyId, limit } = parse(historyQuery, req.query);

  const mine = eq(questions.userId, user.id);
  const forCompany = companyId ? eq(questions.companyId, companyId) : undefined;

  const rows = await db
    .select()
    .from(questions)
    .where(and(mine, forCompany))
    .orderBy(desc(questions.createdAt))
    .limit(limit);

  res.json({ questions: rows });
}
