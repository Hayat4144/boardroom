import { promises, type Database } from "@boardroom/db";
import { eq } from "@boardroom/db/orm";
import { PgBoss } from "pg-boss";
import { extractPromises } from "../extraction/extractPromises";
import { isStubError } from "../stubs";

export const QUEUES = {
  extractPromises: "extract-promises",
} as const;

export interface ExtractPromisesJob {
  filingId: string;
}

export interface Jobs {
  enqueueExtractPromises(filingId: string): Promise<string | null>;
  stop(): Promise<void>;
}

/** Starts pg-boss (creates its own `pgboss` schema), queues and workers. */
export async function startJobs(databaseUrl: string, db: Database): Promise<Jobs> {
  const boss = new PgBoss(databaseUrl);
  boss.on("error", (err) => console.error("[jobs] pg-boss error", err));
  await boss.start();

  await boss.createQueue(QUEUES.extractPromises, {
    retryLimit: 2,
    retryDelay: 30,
    retryBackoff: true,
  });

  await boss.work<ExtractPromisesJob>(QUEUES.extractPromises, async (jobs) => {
    for (const job of jobs) {
      const { filingId } = job.data;
      try {
        const extracted = await extractPromises(filingId);
        // Re-extraction replaces this filing's previous promises (and their checks).
        await db.transaction(async (tx) => {
          await tx.delete(promises).where(eq(promises.sourceFilingId, filingId));
          if (extracted.length > 0) await tx.insert(promises).values(extracted);
        });
        console.log(`[jobs] extract-promises ${filingId}: ${extracted.length} promises`);
      } catch (err) {
        if (isStubError(err)) {
          console.warn(`[jobs] extract-promises ${filingId}: ${err.message}`);
        }
        throw err; // let pg-boss mark the job failed / retry it
      }
    }
  });

  return {
    enqueueExtractPromises: (filingId) =>
      boss.send(QUEUES.extractPromises, { filingId } satisfies ExtractPromisesJob, {
        singletonKey: filingId,
      }),
    stop: () => boss.stop({ graceful: true }),
  };
}
