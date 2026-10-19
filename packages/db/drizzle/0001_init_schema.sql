CREATE TYPE "public"."user_role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TYPE "public"."filing_source" AS ENUM('bse', 'nse', 'manual');--> statement-breakpoint
CREATE TYPE "public"."filing_status" AS ENUM('new', 'processed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."promise_check_status" AS ENUM('kept', 'missed', 'delayed', 'pending', 'unclear');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"filing_id" uuid NOT NULL,
	"page_number" integer NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(1536)
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"bse_code" text,
	"nse_symbol" text,
	"sector" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "companies_bseCode_unique" UNIQUE("bse_code"),
	CONSTRAINT "companies_nseSymbol_unique" UNIQUE("nse_symbol")
);
--> statement-breakpoint
CREATE TABLE "document_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"filing_id" uuid NOT NULL,
	"page_number" integer NOT NULL,
	"text" text NOT NULL,
	CONSTRAINT "document_pages_filingId_pageNumber_unique" UNIQUE("filing_id","page_number")
);
--> statement-breakpoint
CREATE TABLE "filings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"source" "filing_source" NOT NULL,
	"category" text,
	"title" text NOT NULL,
	"filed_at" timestamp with time zone,
	"url" text,
	"storage_key" text,
	"status" "filing_status" DEFAULT 'new' NOT NULL,
	"uploaded_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "filings_url_unique" UNIQUE("url")
);
--> statement-breakpoint
CREATE TABLE "llm_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"purpose" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"cost_usd" numeric(12, 6),
	"latency_ms" integer,
	"request" jsonb,
	"response" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promise_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"promise_id" uuid NOT NULL,
	"checked_against_filing_id" uuid,
	"status" "promise_check_status" NOT NULL,
	"evidence" text,
	"evidence_page" integer,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"source_filing_id" uuid NOT NULL,
	"source_page" integer,
	"speaker" text,
	"statement" text NOT NULL,
	"metric" text,
	"target_value" text,
	"deadline" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"company_id" uuid NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"citations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "watchlist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"company_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "watchlist_items_userId_companyId_unique" UNIQUE("user_id","company_id")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chunks" ADD CONSTRAINT "chunks_filing_id_filings_id_fk" FOREIGN KEY ("filing_id") REFERENCES "public"."filings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_pages" ADD CONSTRAINT "document_pages_filing_id_filings_id_fk" FOREIGN KEY ("filing_id") REFERENCES "public"."filings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "filings" ADD CONSTRAINT "filings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "filings" ADD CONSTRAINT "filings_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_calls" ADD CONSTRAINT "llm_calls_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promise_checks" ADD CONSTRAINT "promise_checks_promise_id_promises_id_fk" FOREIGN KEY ("promise_id") REFERENCES "public"."promises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promise_checks" ADD CONSTRAINT "promise_checks_checked_against_filing_id_filings_id_fk" FOREIGN KEY ("checked_against_filing_id") REFERENCES "public"."filings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promises" ADD CONSTRAINT "promises_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promises" ADD CONSTRAINT "promises_source_filing_id_filings_id_fk" FOREIGN KEY ("source_filing_id") REFERENCES "public"."filings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_index" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_user_id_index" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_index" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "chunks_filing_id_page_number_index" ON "chunks" USING btree ("filing_id","page_number");--> statement-breakpoint
CREATE INDEX "filings_company_id_filed_at_index" ON "filings" USING btree ("company_id","filed_at");--> statement-breakpoint
CREATE INDEX "llm_calls_created_at_index" ON "llm_calls" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "promise_checks_promise_id_checked_at_index" ON "promise_checks" USING btree ("promise_id","checked_at");--> statement-breakpoint
CREATE INDEX "promises_company_id_index" ON "promises" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "promises_source_filing_id_index" ON "promises" USING btree ("source_filing_id");--> statement-breakpoint
CREATE INDEX "questions_user_id_created_at_index" ON "questions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "questions_user_id_company_id_index" ON "questions" USING btree ("user_id","company_id");