import { companies, type Database } from "@boardroom/db";
import { eq } from "@boardroom/db/orm";
import { notFound } from "../lib/http";

export async function getCompanyOr404(db: Database, id: string) {
  const [company] = await db.select().from(companies).where(eq(companies.id, id));
  if (!company) throw notFound("Company");
  return company;
}
