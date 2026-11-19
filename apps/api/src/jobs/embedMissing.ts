// Embeds every chunk that has no embedding yet, e.g. for filings processed
// before embeddings existed. Run: pnpm --filter @boardroom/api embed:missing
import { chunks } from "@boardroom/db";
import { isNull } from "@boardroom/db/orm";
import { db, pool } from "../db";
import { embedFilingChunks } from "../services/search";

const rows = await db
  .selectDistinct({ filingId: chunks.filingId })
  .from(chunks)
  .where(isNull(chunks.embedding));

console.log(`[embed] ${rows.length} filings have chunks without embeddings`);

for (const { filingId } of rows) {
  const count = await embedFilingChunks(filingId);
  console.log(`[embed] ${filingId}: ${count} chunks`);
}

await pool.end();
