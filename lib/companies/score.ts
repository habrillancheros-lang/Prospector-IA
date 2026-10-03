import { getCompaniesCollection } from "./db.ts";
import { scoreInputSchema, scoreOutputSchema, type Criterion, type Company } from "./schema.ts";
import { companySummary } from "./public.ts";
import { aliasValue, fold } from "./filter-values.ts";

export function matchCriterion(company: Company, criterion: Criterion) {
  const actual = company[criterion.field];
  if (actual === null || (Array.isArray(actual) && !actual.length))
    return { actual, fraction: 0, status: "unknown" as const };
  let fraction = 0;
  if (typeof actual === "number") {
    const value = criterion.value;
    if (typeof value === "number")
      fraction = Number(
        criterion.op === "eq"
          ? actual === value
          : criterion.op === "gte"
            ? actual >= value
            : criterion.op === "lte" && actual <= value,
      );
    else if (typeof value === "object" && !Array.isArray(value))
      fraction = Number(actual >= value.min && actual <= value.max);
  } else if (criterion.op === "contains" && !Array.isArray(actual)) {
    const tokens = [...new Set(fold(String(criterion.value)).match(/[\p{L}\p{N}]+/gu) ?? [])];
    const found = new Set(fold(actual).match(/[\p{L}\p{N}]+/gu) ?? []);
    fraction = tokens.length
      ? tokens.filter((token) => found.has(token)).length / tokens.length
      : 0;
  } else {
    const requested = Array.isArray(criterion.value) ? criterion.value : [String(criterion.value)];
    const observed = Array.isArray(actual) ? actual : [actual];
    fraction = Number(
      requested.some((value) =>
        observed.some(
          (candidate) =>
            fold(candidate) === fold(value) ||
            fold(candidate) === fold(aliasValue(criterion.field, value)),
        ),
      ),
    );
  }
  return {
    actual,
    fraction,
    status:
      fraction === 1 ? ("match" as const) : fraction > 0 ? ("partial" as const) : ("miss" as const),
  };
}

export function scoreLoadedCompanies(rawInput: unknown, loaded: readonly Company[]) {
  const input = scoreInputSchema.parse(rawInput);
  const ids = [...new Set(input.companyIds)].sort();
  const byId = new Map(loaded.map((company) => [company.id, company]));
  const totalWeight = input.criteria.reduce((sum, criterion) => sum + criterion.weight, 0);
  const missingCompanyIds: string[] = [];
  const excludedCompanyIds: string[] = [];
  const companies = [];
  for (const id of ids) {
    const company = byId.get(id);
    if (!company) {
      missingCompanyIds.push(id);
      continue;
    }
    const breakdown = input.criteria.map((criterion) => {
      const match = matchCriterion(company, criterion);
      return {
        criterion,
        ...match,
        contribution: (100 * criterion.weight * match.fraction) / totalWeight,
      };
    });
    if (breakdown.some((item) => item.criterion.required && item.fraction < 1)) {
      excludedCompanyIds.push(id);
      continue;
    }
    const score = Math.min(
      100,
      breakdown.reduce((sum, item) => sum + item.contribution, 0),
    );
    companies.push({ ...companySummary(company), score, breakdown });
  }
  companies.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return scoreOutputSchema.parse({
    evaluated: ids.length - missingCompanyIds.length,
    eligible: companies.length,
    returned: Math.min(companies.length, input.topN),
    companies: companies.slice(0, input.topN),
    excludedCompanyIds,
    missingCompanyIds,
  });
}

export async function scoreCompanies(rawInput: unknown) {
  const input = scoreInputSchema.parse(rawInput);
  const companies = await (
    await getCompaniesCollection()
  )
    .find(
      { id: { $in: [...new Set(input.companyIds)] } },
      {
        projection: { _id: 0, embedding: 0, embeddingModel: 0, embeddingTextHash: 0 },
        maxTimeMS: 10_000,
      },
    )
    .toArray();
  return scoreLoadedCompanies(input, companies);
}
