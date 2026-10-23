import cors from "cors";
import express from "express";
import morgan from "morgan";
import { authHandler } from "./auth/auth";
import { currentUser, requireAuth } from "./auth/middleware";
import { env } from "./env";
import { errorHandler, notFound } from "./http";
import { askRouter } from "./routes/ask";
import { companiesRouter } from "./routes/companies";
import { filingsRouter } from "./routes/filings";
import { llmCallsRouter } from "./routes/llmCalls";
import { promisesRouter } from "./routes/promises";
import { watchlistRouter } from "./routes/watchlist";

export const app = express();

// Log every request: method, path, status, response time and size.
// Quiet in tests so test output stays readable.
if (env.NODE_ENV !== "test") app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));

app.disable("x-powered-by");
app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));
app.get("/health", (_req, res) => void res.json({ ok: true }));

app.get("/", async (_req, res) => {
  res.json({ status: "ok" });
});

// Better Auth reads its own request bodies, so it goes before express.json().
app.all("/api/auth/{*any}", authHandler);
app.use(express.json({ limit: "1mb" }));

// Every other /api route needs a signed-in user.
const api = express.Router();
api.use(requireAuth);
api.get("/me", (req, res) => void res.json({ user: currentUser(req) }));

api.use(companiesRouter);
api.use(watchlistRouter);
api.use(filingsRouter);

api.use(promisesRouter);
api.use(askRouter);
api.use(llmCallsRouter);

api.use(() => {
  throw notFound("Route");
});

app.use("/api", api);
app.use(errorHandler);
