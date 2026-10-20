import { companies, type Company } from "@boardroom/db";
import { eq } from "@boardroom/db/orm";
import { db } from "../db";
import { notFound } from "../http";

/** The company with this id, or a 404. */
export async function findCompany(id: string): Promise<Company> {
  const [company] = await db.select().from(companies).where(eq(companies.id, id));
  if (!company) throw notFound("Company");

  return company;
}
