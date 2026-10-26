CREATE TYPE "public"."filing_type" AS ENUM('transcript', 'presentation', 'results', 'other');--> statement-breakpoint
DROP INDEX "filings_company_id_filed_at_index";--> statement-breakpoint
-- New columns start nullable so existing rows can be backfilled first.
ALTER TABLE "filings" ADD COLUMN "type" "filing_type";--> statement-breakpoint
ALTER TABLE "filings" ADD COLUMN "fiscal_year" integer;--> statement-breakpoint
ALTER TABLE "filings" ADD COLUMN "fiscal_quarter" integer;--> statement-breakpoint
ALTER TABLE "filings" ADD COLUMN "filed_on" date;--> statement-breakpoint
-- Backfill. Type comes from category (falling back to the title when category is empty);
-- the period is parsed from the title ("Q4 FY25 earnings call transcript");
-- filed_on is filed_at, else created_at, as an IST date.
UPDATE "filings" SET
	"type" = (CASE
		WHEN coalesce(nullif(trim("category"), ''), "title") ILIKE '%transcript%' THEN 'transcript'
		WHEN coalesce(nullif(trim("category"), ''), "title") ~* 'ppt|presentation' THEN 'presentation'
		WHEN coalesce(nullif(trim("category"), ''), "title") ILIKE '%result%' THEN 'results'
		ELSE 'other'
	END)::"filing_type",
	"fiscal_quarter" = (regexp_match("title", 'Q([1-4])[\s_-]*FY[\s_-]*(\d{2})', 'i'))[1]::integer,
	"fiscal_year" = (regexp_match("title", 'Q([1-4])[\s_-]*FY[\s_-]*(\d{2})', 'i'))[2]::integer,
	"filed_on" = (coalesce("filed_at", "created_at") AT TIME ZONE 'Asia/Kolkata')::date;--> statement-breakpoint
-- Refuse to guess: stop with a list of rows whose title has no "Qn FYnn".
DO $$
DECLARE unparsed text;
BEGIN
	SELECT string_agg(format('%s (%s)', "id", "title"), '; ') INTO unparsed
	FROM "filings" WHERE "fiscal_year" IS NULL OR "fiscal_quarter" IS NULL;

	IF unparsed IS NOT NULL THEN
		RAISE EXCEPTION 'Cannot infer fiscal quarter from title for filings: %. Fix their titles (e.g. "Q4 FY25 ...") and re-run.', unparsed;
	END IF;
END $$;--> statement-breakpoint
ALTER TABLE "filings" ALTER COLUMN "type" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "filings" ALTER COLUMN "fiscal_year" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "filings" ALTER COLUMN "fiscal_quarter" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "filings" ALTER COLUMN "filed_on" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "filings_company_period_type_unique" ON "filings" USING btree ("company_id","fiscal_year","fiscal_quarter","type");--> statement-breakpoint
ALTER TABLE "filings" ADD CONSTRAINT "filings_fiscal_quarter_check" CHECK ("filings"."fiscal_quarter" between 1 and 4);
