import cors from "cors";
import express from "express";
import { createRequireAuth, currentUser } from "./auth/middleware";
import { errorHandler, HttpError } from "./lib/http";
import { runWithContext } from "./lib/requestContext";
import { askRouter } from "./routes/ask";
import { companiesRouter } from "./routes/companies";
import type { AppDeps } from "./routes/deps";
import { filingsRouter } from "./routes/filings";
import { llmCallsRouter } from "./routes/llmCalls";
import { meRouter } from "./routes/me";
import { promisesRouter } from "./routes/promises";
import { watchlistRouter } from "./routes/watchlist";

export function createApp(deps: AppDeps) {
  const app = express();
  app.disable("x-powered-by");
  app.use(cors({ origin: deps.webOrigin, credentials: true }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  // Better Auth parses its own bodies, so it must be mounted before express.json().
  if (deps.authHandler) app.all("/api/auth/{*any}", deps.authHandler);

  app.use(express.json({ limit: "1mb" }));

  // Everything else under /api requires a signed-in user.
  const api = express.Router();
  api.use(createRequireAuth(deps.getSessionUser));
  api.use((req, _res, next) => runWithContext({ userId: currentUser(req).id }, next));
  api.use(meRouter());
  api.use(companiesRouter(deps));
  api.use(watchlistRouter(deps));
  api.use(filingsRouter(deps));
  api.use(promisesRouter(deps));
  api.use(askRouter(deps));
  api.use(llmCallsRouter(deps));
  api.use(() => {
    throw new HttpError(404, "not_found", "Route not found");
  });
  app.use("/api", api);

  app.use(errorHandler);
  return app;
}
