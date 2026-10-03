import { getCompaniesCollection } from "./db.ts";
import { embedTexts, embedQueryTexts } from "./embeddings.ts";
import { resolveFilterValue } from "./filter-values.ts";
import { companySummary } from "./public.ts";
import {
  EMBEDDING_DIMENSIONS,
  VECTOR_INDEX_NAME,
  searchInputSchema,
  searchOutputSchema,
  type Company,
  type SearchFilters,
} from "./schema.ts";

export interface SearchStore {
  count(filter: Record<string, unknown>): Promise<number>;
  distinct(field: string): Promise<string[]>;
  find(filter: Record<string, unknown>, limit: number): Promise<Company[]>;
  vector(pipeline: Record<string, unknown>[]): Promise<(Company & { semanticScore: number })[]>;
}
export function mongoFilter(filters: SearchFilters) {
  const result: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(filters)) {
    if (Array.isArray(value)) result[field] = { $in: value };
    else if (typeof value === "string")
      result[field] = { $regex: value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
    else if (value)
      result[field] = {
        ...(value.min !== undefined ? { $gte: value.min } : {}),
        ...(value.max !== undefined ? { $lte: value.max } : {}),
      };
  }
  return result;
}
export function createCompanySearch(
  store: SearchStore,
  embed: typeof embedTexts = embedQueryTexts,
) {
  return async function search(rawInput: unknown) {
    const input = searchInputSchema.parse(rawInput);
    const limit = Math.max(1, Math.min(100, input.limit));
    const appliedFilters: SearchFilters = { ...input.filters };
    const unrecognized: { field: string; value: string; didYouMean: string[] }[] = [];
    for (const field of ["companyType", "location", "employeeBand", "tags"] as const) {
      const requested = input.filters[field];
      if (!requested) continue;
      const vocabulary = await store.distinct(field);
      appliedFilters[field] = [
        ...new Set(
          requested.map((value) => {
            const result = resolveFilterValue(field, value, vocabulary);
            if (!result.recognized)
              unrecognized.push({ field, value, didYouMean: result.didYouMean });
            return result.value;
          }),
        ),
      ];
    }
    const filter = mongoFilter(appliedFilters);
    const total = await store.count(filter);
    const relaxationHints: { removed: string; wouldReturn: number }[] = [];
    if (total < 10) {
      for (const field of Object.keys(appliedFilters)) {
        const relaxed = { ...filter };
        delete relaxed[field];
        const wouldReturn = await store.count(relaxed);
        if (wouldReturn > total) relaxationHints.push({ removed: field, wouldReturn });
      }
    }
    let companies:
      | ReturnType<typeof companySummary>[]
      | (ReturnType<typeof companySummary> & { semanticScore: number })[] = [];
    if (total > 0 && input.semanticQuery) {
      const [vector] = await embed([input.semanticQuery], "query");
      if (!vector || vector.length !== EMBEDDING_DIMENSIONS || !vector.every(Number.isFinite))
        throw new Error("Invalid query embedding");
      // Regex is not supported in $vectorSearch pre-filters. Apply text filters
      // after enumerating all exact neighbors in this fixed, small dataset.
      const preFilter = Object.fromEntries(
        Object.entries(filter).filter(([field]) => field !== "name" && field !== "description"),
      );
      const scanCount = await store.count(preFilter);
      if (scanCount > 20_000)
        throw new Error("Dataset exceeds the deterministic vector scan limit");
      const pipeline: Record<string, unknown>[] = [
        {
          $vectorSearch: {
            index: VECTOR_INDEX_NAME,
            path: "embedding",
            queryVector: vector,
            exact: true,
            limit: scanCount,
            ...(Object.keys(preFilter).length ? { filter: preFilter } : {}),
          },
        },
        { $set: { semanticScore: { $meta: "vectorSearchScore" } } },
        { $match: filter },
        { $sort: { semanticScore: -1, id: 1 } },
        { $limit: limit },
        { $project: { _id: 0, embedding: 0, embeddingModel: 0, embeddingTextHash: 0 } },
      ];
      companies = (await store.vector(pipeline)).map((company) => ({
        ...companySummary(company),
        semanticScore: company.semanticScore,
      }));
    } else if (total > 0) companies = (await store.find(filter, limit)).map(companySummary);
    return searchOutputSchema.parse({
      total,
      returned: companies.length,
      companies,
      appliedFilters,
      unrecognized,
      relaxationHints,
    });
  };
}

export async function searchCompanies(input: unknown) {
  // Validate before opening a DB connection.
  const parsed = searchInputSchema.parse(input);
  const collection = await getCompaniesCollection();
  return createCompanySearch({
    count: (filter) => collection.countDocuments(filter, { maxTimeMS: 10_000 }),
    distinct: async (field) =>
      (await collection.distinct(field, {}, { maxTimeMS: 10_000 })).filter(
        (value): value is string => typeof value === "string",
      ),
    find: (filter, limit) =>
      collection
        .find(filter, {
          projection: { _id: 0, embedding: 0, embeddingModel: 0, embeddingTextHash: 0 },
          maxTimeMS: 10_000,
        })
        .sort({ id: 1 })
        .limit(limit)
        .toArray(),
    vector: (pipeline) =>
      collection
        .aggregate<Company & { semanticScore: number }>(pipeline, { maxTimeMS: 30_000 })
        .toArray(),
  })(parsed);
}
