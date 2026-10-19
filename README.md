# Boardroom

Track what the management of Indian listed companies (BSE/NSE) **promised** on earnings
calls, check it against later results, and **ask questions** across a company's filings
with page-level citations.

- **Promise tracker:** guidance extracted from transcripts, checked as kept / missed /
  delayed / pending.
- **Ask-the-filings:** a Q&A agent that answers with citations to the exact PDF page.
- Watchlists and question history are per user; company data is shared.

> This is a learning project. The AI parts (`apps/api/src/agent/`,
> `apps/api/src/extraction/`, `evals/`) are hand-written by Hayat. Until they are,
> they are typed stubs that throw `TODO(HAYAT): implement`, and the app shows a
> "not built yet" state wherever they're used. See [CLAUDE.md](CLAUDE.md).

## Stack

| Part     | Tech                                                                         |
| -------- | ---------------------------------------------------------------------------- |
| Monorepo | pnpm workspaces + Turborepo, TypeScript (strict)                             |
| Web      | React + Vite, React Router, TanStack Query, Tailwind CSS, shadcn/ui          |
| API      | Node.js + Express, Zod, Better Auth (email + password, httpOnly cookies)     |
| Data     | PostgreSQL 16+ with pgvector, Drizzle ORM + drizzle-kit migrations           |
| Jobs     | pg-boss (queue lives in Postgres)                                            |
| Files    | S3 (or Cloudflare R2): private bucket, presigned URLs, nothing on local disk |
| PDFs     | pdf-parse (digital PDFs; no OCR yet)                                         |
| LLM      | Anthropic SDK behind `LLMClient`; every call logged to `llm_calls`           |
| Tests    | Vitest + Supertest, PGlite (in-process Postgres), aws-sdk-client-mock        |

```
apps/
  api/        Express API (auth, routes, services, jobs, llm, + HAYAT stubs in agent/ & extraction/)
  web/        React app (design tokens in src/index.css)
packages/
  db/         Drizzle schema, migrations (drizzle/), client, seed, test DB helper
evals/        Hayat's evals (README only for now)
scripts/      setup-local-db.sql
```

## Prerequisites

- **Node.js 22+** and **pnpm 10** (`corepack enable` or `npm i -g pnpm`)
- **PostgreSQL 16+ with pgvector**, installed locally. On Ubuntu/Debian with the PGDG repo:
  `sudo apt install postgresql-17 postgresql-17-pgvector`
- An **S3 bucket** (or R2 bucket) and an access key limited to it; see [S3 setup](#s3-setup)
- An **Anthropic API key**, only once your extraction or agent code calls the LLM

## Setup

### 1. Install

```bash
pnpm install
```

### 2. Environment

```bash
cp .env.example .env
```

Fill in `.env` at the repo root; every app reads it from there:

| Variable                                   | Notes                                                                                         |
| ------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                             | Default matches `scripts/setup-local-db.sql`                                                  |
| `BETTER_AUTH_SECRET`                       | **Required.** `openssl rand -base64 32`                                                       |
| `BETTER_AUTH_URL`                          | API origin, default `http://localhost:3000`                                                   |
| `S3_BUCKET`, `S3_REGION`                   | Your private bucket                                                                           |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | **Required.** Keys of the bucket-scoped IAM user                                              |
| `S3_ENDPOINT`                              | Leave empty for AWS; set for R2 (`https://<account>.r2.cloudflarestorage.com`, region `auto`) |
| `VITE_API_URL`                             | Where the browser calls the API, default `http://localhost:3000`                              |
| `SEED_ADMIN_EMAIL` / `_PASSWORD` / `_NAME` | Admin user created by the seed (password ≥ 8 chars)                                           |
| `LLM_API_KEY`                              | Optional until Phase 2                                                                        |
| `PORT`, `WEB_ORIGIN`, `ASK_DAILY_LIMIT`    | Optional; defaults `3000`, `http://localhost:5173`, `20`                                      |

The API checks its environment on startup and lists everything that's missing or invalid.

### 3. Database (one-time)

Create the `boardroom` role and database and enable pgvector. pgvector needs a superuser,
so this step runs as `postgres`:

```bash
pnpm db:setup        # sudo -u postgres psql -f scripts/setup-local-db.sql
```

The script is safe to re-run.

### 4. Migrate and seed

```bash
pnpm db:migrate      # creates all tables (and enables pgvector)
pnpm db:seed         # 5 placeholder companies + the admin user from SEED_ADMIN_*
```

Re-running the seed is safe: existing companies are skipped and the admin keeps their password.

### 5. Run

```bash
pnpm dev
```

- Web: http://localhost:5173
- API: http://localhost:3000 (`GET /health`)

Sign in with the seeded admin, add a company to your watchlist, upload a transcript PDF
on its **Filings** tab and process it. Pages and chunks are stored, and promise extraction
is queued. It will show "not built yet" until `extractPromises()` is implemented.

## Scripts

| Command            | What it does                                                 |
| ------------------ | ------------------------------------------------------------ |
| `pnpm dev`         | API (tsx watch) + web (Vite) together                        |
| `pnpm test`        | All tests (Vitest)                                           |
| `pnpm typecheck`   | TypeScript across every package                              |
| `pnpm lint`        | ESLint                                                       |
| `pnpm format`      | Prettier (write); `pnpm format:check` to verify              |
| `pnpm build`       | Production build of the web app                              |
| `pnpm db:setup`    | One-time local role/database/pgvector setup                  |
| `pnpm db:generate` | New migration from schema changes (`packages/db/src/schema`) |
| `pnpm db:migrate`  | Apply migrations                                             |
| `pnpm db:seed`     | Seed companies + admin user                                  |
| `pnpm db:studio`   | Drizzle Studio (browse the database)                         |

## S3 setup

The bucket stays **private**. The browser never reads it directly: the API hands out
5-minute presigned URLs to signed-in users.

1. Create the bucket (e.g. `boardroom-dev` in `ap-south-1`) with **Block all public
   access** on and no bucket policy.
2. Create an IAM user and attach this **inline policy to the user**. It is not a bucket
   policy, which is why it has no `Principal`:

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
         "Resource": "arn:aws:s3:::boardroom-dev/*"
       },
       {
         "Effect": "Allow",
         "Action": "s3:ListBucket",
         "Resource": "arn:aws:s3:::boardroom-dev"
       }
     ]
   }
   ```

   `ListBucket` lets S3 answer "not found" (404) instead of "access denied" for missing keys.

3. Create an access key for that user and put it in `.env`.

Objects are stored at `filings/{companyId}/{filingId}.pdf`. Uploads go browser → API → S3
in memory, so no CORS rule is needed.

## Users and roles

- Anyone can sign up at `/signup` and gets the `user` role. Users can read shared company
  data and manage their own watchlist and questions.
- **Admins** can upload and process filings, run promise checks and view `/admin/llm-calls`.
  The seed creates one admin. To promote someone else:

  ```sql
  update "user" set role = 'admin' where email = 'someone@example.com';
  ```

- Email verification and password-reset links are printed to the API console in development.

## API

All routes are under `/api` and require a session except `/api/auth/*`. Errors are JSON
`{ "error": code, "message": text }`. A HAYAT stub that isn't implemented yet answers
**501 `not_implemented`**.

| Method & path                                                 | Access | Notes                                                       |
| ------------------------------------------------------------- | ------ | ----------------------------------------------------------- |
| `/api/auth/*`                                                 | public | Better Auth (sign-up, sign-in, sign-out)                    |
| `GET /api/me`                                                 | user   |                                                             |
| `GET /api/companies?q=`                                       | user   | Search by name / NSE / BSE                                  |
| `GET /api/companies/:id`                                      | user   | Detail + counts                                             |
| `GET/POST /api/watchlist`, `DELETE /api/watchlist/:companyId` | user   | Own watchlist only                                          |
| `GET /api/companies/:id/filings`                              | user   |                                                             |
| `GET /api/filings/:id/url`                                    | user   | Presigned PDF URL (5 min)                                   |
| `POST /api/companies/:id/filings/upload`                      | admin  | multipart: `file`, `title`, `category?`, `filedAt?`, `url?` |
| `POST /api/filings/:id/process`                               | admin  | S3 → pages + chunks → queue extraction                      |
| `GET /api/companies/:id/promises`                             | user   | With latest check                                           |
| `POST /api/companies/:id/promises/check`                      | admin  | Calls `checkPromises()`                                     |
| `POST /api/companies/:id/ask`                                 | user   | `{ question }`, rate-limited per user                       |
| `GET /api/questions?companyId=`                               | user   | Own history only                                            |
| `GET /api/llm-calls`, `GET /api/llm-calls/:id`                | admin  | Cost, tokens, latency; full request/response                |

## Where Hayat's code plugs in

| File                                         | Called by                                                                           |
| -------------------------------------------- | ----------------------------------------------------------------------------------- |
| `apps/api/src/extraction/extractPromises.ts` | `extract-promises` job after a filing is processed; results are saved to `promises` |
| `apps/api/src/extraction/checkPromises.ts`   | `POST /api/companies/:id/promises/check`                                            |
| `apps/api/src/agent/answerQuestion.ts`       | `POST /api/companies/:id/ask`; result saved to `questions`                          |
| `apps/api/src/agent/tools.ts`                | Your agent loop                                                                     |

Inside them, use `getDb()` (`apps/api/src/db.ts`) and
`getLLMClient().createMessage(params, { purpose })` (`apps/api/src/llm`). Every LLM call
is then logged with tokens, cost and latency, and attributed to the user who asked.

## Testing

```bash
pnpm test
```

Route tests run the real Express app against **PGlite** (Postgres in-process, with the
real migrations and pgvector), so they need no running database and never touch your
data. S3 is mocked with `aws-sdk-client-mock` or an in-memory store.

## Troubleshooting

- **`Invalid environment: BETTER_AUTH_SECRET …`**: fill in `.env` (see step 2).
- **`permission denied to create extension "vector"`** during migrate: run `pnpm db:setup`
  first, as pgvector must be enabled by a superuser.
- **`password authentication failed for user "boardroom"`**: `pnpm db:setup` hasn't run,
  or `DATABASE_URL` doesn't match it.
- **Port 5173 already in use**: another Vite dev server is running (`strictPort` is on).
- **"Can't reach the API server" in the browser**: the API isn't running, or
  `VITE_API_URL` / `WEB_ORIGIN` don't match the URLs you're using.
