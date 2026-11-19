import { promises } from "@boardroom/db";
import { eq } from "@boardroom/db/orm";
import { PgBoss } from "pg-boss";
import { db } from "../db";
import { env } from "../env";
import { extractPromises } from "../extraction/extractPromises";
import { embedFilingChunks } from "../services/search";

/** Background jobs run on pg-boss, a queue stored in Postgres (its own `pgboss` schema). */
const boss = new PgBoss(env.DATABASE_URL);

const EXTRACT_PROMISES = "extract-promises";
const EMBED_CHUNKS = "embed-chunks";

type FilingJob = { filingId: string };

export async function startJobs(): Promise<void> {
  boss.on("error", (err) => console.error("[jobs] pg-boss error", err));
  await boss.start();

  await boss.createQueue(EXTRACT_PROMISES, { retryLimit: 2, retryDelay: 30, retryBackoff: true });

  await boss.createQueue(EMBED_CHUNKS, { retryLimit: 2, retryDelay: 30, retryBackoff: true });

  await boss.work<FilingJob>(EXTRACT_PROMISES, async (jobs) => {
    for (const job of jobs) await saveExtractedPromises(job.data.filingId);
  });

  await boss.work<FilingJob>(EMBED_CHUNKS, async (jobs) => {
    for (const job of jobs) await runEmbedChunks(job.data.filingId);
  });
}

export function stopJobs(): Promise<void> {
  return boss.stop({ graceful: true });
}

/** Queues promise extraction for a filing; returns the job id (null if already queued). */
export function enqueueExtractPromises(filingId: string): Promise<string | null> {
  const data: FilingJob = { filingId };
  return boss.send(EXTRACT_PROMISES, data, { singletonKey: filingId });
}

/** Queues embedding of a filing's chunks; returns the job id (null if already queued). */
export function enqueueEmbedChunks(filingId: string): Promise<string | null> {
  const data: FilingJob = { filingId };
  return boss.send(EMBED_CHUNKS, data, { singletonKey: filingId });
}

async function runEmbedChunks(filingId: string): Promise<void> {
  try {
    const count = await embedFilingChunks(filingId);
    console.log(`[jobs] ${EMBED_CHUNKS} ${filingId}: ${count} chunks`);
  } catch (err) {
    console.warn(`[jobs] ${EMBED_CHUNKS} ${filingId} failed:`, (err as Error).message);
    throw err; // pg-boss marks the job failed and retries it
  }
}

async function saveExtractedPromises(filingId: string): Promise<void> {
  try {
    const extracted = await extractPromises(filingId);
    console.log("Extracted", extracted);

    await db.transaction(async (tx) => {
      await tx.delete(promises).where(eq(promises.sourceFilingId, filingId));
      if (extracted.length > 0) await tx.insert(promises).values(extracted);
    });

    console.log(`[jobs] ${EXTRACT_PROMISES} ${filingId}: ${extracted.length} promises`);
  } catch (err) {
    console.warn(`[jobs] ${EXTRACT_PROMISES} ${filingId} failed:`, (err as Error).message);
    throw err; // pg-boss marks the job failed and retries it
  }
}
