import { getCompaniesCollection } from "./db.ts";
import { detailsInputSchema, detailsOutputSchema, type Company } from "./schema.ts";
import { publicCompany } from "./public.ts";
export function createCompanyDetails(findOne: (id: string) => Promise<Company | null>) {
  return async (companyId: string) => {
    const input = detailsInputSchema.parse({ companyId });
    const company = await findOne(input.companyId);
    return detailsOutputSchema.parse(
      company
        ? { status: "found", company: publicCompany(company) }
        : { status: "not_found", companyId: input.companyId },
    );
  };
}
export async function getCompany(companyId: string) {
  detailsInputSchema.parse({ companyId });
  return createCompanyDetails(async (id) =>
    (await getCompaniesCollection()).findOne(
      { id },
      {
        projection: { _id: 0, embedding: 0, embeddingModel: 0, embeddingTextHash: 0 },
        maxTimeMS: 10_000,
      },
    ),
  )(companyId);
}
