import { companySchema, companySummarySchema, type Company } from "./schema.ts";
export function publicCompany(company: Company): Company {
  const {
    id,
    sourceIndex,
    name,
    description,
    companyType,
    location,
    employeeBand,
    rating,
    tags,
    qualityFlags,
    source,
  } = company;
  return companySchema.parse({
    id,
    sourceIndex,
    name,
    description,
    companyType,
    location,
    employeeBand,
    rating,
    tags,
    qualityFlags,
    source,
  });
}
export function companySummary(company: Company) {
  const { id, name, companyType, location, employeeBand, rating } = company;
  return companySummarySchema.parse({ id, name, companyType, location, employeeBand, rating });
}
