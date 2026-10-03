import { COMPANY_TYPES, type Company, type CompanyType } from "./schema.ts";

export type RawCompany = Record<string, string>;
export function clean(value: string | undefined): string | null {
  const text = value?.replace(/\s+/g, " ").trim() ?? "";
  return /^(?:null|none|nan|n\/a)?$/i.test(text) ? null : text;
}

export function normalizeCompany(raw: RawCompany): Company {
  const index = clean(raw[""]);
  if (!index || !/^\d+$/.test(index) || !Number.isSafeInteger(Number(index)))
    throw new Error("Invalid source index");
  const name = clean(raw.names);
  if (!name) throw new Error(`Missing company name for source index ${index}`);
  const companyTypeRaw = clean(raw.company_type);
  const companyType =
    COMPANY_TYPES.find((value) => value.toLowerCase() === companyTypeRaw?.toLowerCase()) ?? null;
  const locationRaw = clean(raw.locations);
  const location =
    locationRaw && !/\b(?:years? old|employees)\b|^\d/i.test(locationRaw) ? locationRaw : null;
  const employeesRaw = clean(raw.employees);
  const employeeBand = employeesRaw && /^(?:\d+-\d+|\d+)$/.test(employeesRaw) ? employeesRaw : null;
  const ratingRaw = clean(raw.ratings);
  const rating =
    ratingRaw && /^\d+(?:\.\d+)?$/.test(ratingRaw) && Number.isFinite(Number(ratingRaw))
      ? Number(ratingRaw)
      : null;
  const qualityFlags: string[] = [];
  if (companyTypeRaw && !companyType) qualityFlags.push("ambiguous_company_type");
  if (locationRaw && !location) qualityFlags.push("ambiguous_location");
  if (employeesRaw && !employeeBand) qualityFlags.push("ambiguous_employees");
  if (ratingRaw && rating === null) qualityFlags.push("invalid_rating");
  return {
    id: `indian-csv:${Number(index)}`,
    sourceIndex: Number(index),
    name,
    description: clean(raw.decs),
    companyType: companyType as CompanyType | null,
    location,
    employeeBand,
    rating,
    tags: [
      ...new Set(
        (clean(raw.tags) ?? "")
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
      ),
    ],
    qualityFlags,
    source: {
      companyType: companyTypeRaw,
      location: locationRaw,
      oldTime: clean(raw.old_time),
      employees: employeesRaw,
      reviews: clean(raw.reviews),
    },
  };
}

export function embeddingText(company: Company): string {
  return [
    `Name: ${company.name}`,
    company.description && `Description: ${company.description}`,
    company.companyType && `Company type: ${company.companyType}`,
    company.location && `Reported location: ${company.location}`,
    company.employeeBand && `Reported employee band: ${company.employeeBand}`,
    company.tags.length && `Tags: ${company.tags.join(", ")}`,
  ]
    .filter(Boolean)
    .join("\n");
}
