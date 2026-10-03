import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { normalizeCompany } from "./normalize.ts";
import { scoreLoadedCompanies, matchCriterion } from "./score.ts";
import {
  searchInputSchema,
  scoreInputSchema,
  detailsInputSchema,
  criterionSchema,
  type Criterion,
} from "./schema.ts";
import { createCompanySearch, mongoFilter, type SearchStore } from "./search.ts";
import { createCompanyDetails } from "./details.ts";
import { resolveFilterValue } from "./filter-values.ts";
import { createQueryEmbeddingCache } from "./embeddings.ts";

// Isolated unit fixtures; never imported into Atlas or product vocabulary.
test("query embeddings reuse a bounded process-local cache and failed calls are retried", async () => {
  let calls = 0;
  const cached = createQueryEmbeddingCache(async () => {
    calls++;
    return [Array(256).fill(calls)];
  });
  const [first, second] = await Promise.all([
    cached(["same query"], "query"),
    cached(["same query"], "query"),
  ]);
  assert.deepEqual(first, second);
  first[0][0] = 99;
  assert.equal((await cached(["same query"], "query"))[0][0], 1);
  assert.equal(calls, 1);
  await cached(["same query"], "document");
  assert.equal(calls, 2);
  let attempts = 0;
  const failing = createQueryEmbeddingCache(async () => {
    if (++attempts === 1) throw new Error("transient");
    return [Array(256).fill(1)];
  });
  await assert.rejects(failing(["retry"], "query"), /transient/);
  await failing(["retry"], "query");
  assert.equal(attempts, 2);
});
const company = normalizeCompany({
  "": "1",
  names: "Fixture One",
  company_type: "Private",
  locations: "Mumbai",
  employees: "51-200",
  ratings: "4.2",
  decs: "Cloud software services",
  tags: "SaaS, IT",
});
const second = {
  ...company,
  id: "indian-csv:2",
  sourceIndex: 2,
  description: null,
  rating: null,
  tags: [],
};
const criterion = (value: Partial<Criterion> = {}): Criterion => ({
  field: "companyType",
  op: "eq",
  value: "Private",
  weight: 1,
  required: false,
  ...value,
});

test("strict schemas reject injection, unsupported fields/operators, bad bounds and excessive inputs", () => {
  for (const input of [
    { filters: { $where: "x" } },
    { filters: { registeredState: ["Maharashtra"] } },
    { filters: { rating: { min: 5, max: 1 } } },
    { filters: { companyType: [] } },
    { semanticQuery: " " },
    { limit: 1.5 },
    { filters: { name: { $regex: ".*" } } },
    { semanticQuery: "a".repeat(2001) },
  ])
    assert.equal(searchInputSchema.safeParse(input).success, false);
  assert.equal(
    criterionSchema.safeParse(criterion({ field: "rating", op: "contains" })).success,
    false,
  );
  for (const weight of [0, -1, 101, Infinity])
    assert.equal(criterionSchema.safeParse(criterion({ weight })).success, false);
  assert.equal(
    scoreInputSchema.safeParse({ companyIds: Array(101).fill(company.id), criteria: [criterion()] })
      .success,
    false,
  );
  assert.equal(
    scoreInputSchema.safeParse({ companyIds: [company.id], criteria: [] }).success,
    false,
  );
  assert.equal(searchInputSchema.parse({}).limit, 50);
});
test("input schemas export as JSON Schema for later MCP registration", () => {
  for (const schema of [searchInputSchema, scoreInputSchema, detailsInputSchema]) {
    const json = z.toJSONSchema(schema);
    assert.equal(json.type, "object");
    assert.equal(json.additionalProperties, false);
  }
});
test("Mongo filters AND fields, OR array values, use inclusive ranges and escape regex", () => {
  assert.deepEqual(
    mongoFilter({
      companyType: ["Private", "Public"],
      location: ["Mumbai"],
      rating: { min: 3, max: 5 },
      name: "a.*(b)",
    }),
    {
      companyType: { $in: ["Private", "Public"] },
      location: { $in: ["Mumbai"] },
      rating: { $gte: 3, $lte: 5 },
      name: { $regex: "a\\.\\*\\(b\\)", $options: "i" },
    },
  );
});
test("vocabulary normalization supports aliases and suggests typos without auto-correcting", () => {
  assert.equal(resolveFilterValue("companyType", " pvt ltd ", ["Private"]).value, "Private");
  assert.equal(resolveFilterValue("location", " mUmBaI ", ["Mumbai"]).value, "Mumbai");
  const typo = resolveFilterValue("companyType", "Privat", ["Private", "Public"]);
  assert.equal(typo.recognized, false);
  assert.equal(typo.value, "Privat");
  assert.deepEqual(typo.didYouMean, ["Private"]);
});
test("weighted scoring, exact text tokens, partial matches and unknown values", () => {
  const result = scoreLoadedCompanies(
    {
      companyIds: [company.id],
      criteria: [
        criterion({ weight: 3 }),
        criterion({ field: "description", op: "contains", value: "cloud banking", weight: 1 }),
      ],
    },
    [company],
  );
  assert.equal(result.companies[0].score, 87.5);
  assert.deepEqual(
    result.companies[0].breakdown.map((item) => item.status),
    ["match", "partial"],
  );
  assert.equal(
    matchCriterion(company, criterion({ field: "description", op: "contains", value: "service" }))
      .fraction,
    0,
  );
  const unknown = scoreLoadedCompanies(
    {
      companyIds: [second.id],
      criteria: [criterion(), criterion({ field: "description", op: "contains", value: "cloud" })],
    },
    [second],
  );
  assert.equal(unknown.companies[0].score, 50);
  assert.equal(unknown.companies[0].breakdown[1].status, "unknown");
});
test("required misses, partial matches and unknowns exclude candidates", () => {
  for (const item of [
    criterion({ value: "Public", required: true }),
    criterion({ field: "description", op: "contains", value: "cloud banking", required: true }),
    criterion({ field: "rating", op: "gte", value: 3, required: true }),
  ]) {
    const selected = item.field === "rating" ? second : company;
    const result = scoreLoadedCompanies({ companyIds: [selected.id], criteria: [item] }, [
      selected,
    ]);
    assert.equal(result.returned, 0);
    assert.deepEqual(result.excludedCompanyIds, [selected.id]);
  }
});
test("numeric boundaries and categorical/array OR criteria behave predictably", () => {
  for (const item of [
    criterion({ field: "rating", op: "gte", value: 4.2 }),
    criterion({ field: "rating", op: "lte", value: 4.2 }),
    criterion({ field: "rating", op: "between", value: { min: 4.2, max: 4.2 } }),
    criterion({ op: "in", value: ["Public", "pvt"] }),
    criterion({ field: "tags", op: "in", value: ["Finance", "IT"] }),
  ])
    assert.equal(matchCriterion(company, item).status, "match");
  assert.equal(
    matchCriterion(second, criterion({ field: "tags", op: "contains", value: "IT" })).status,
    "unknown",
  );
});
test("ranking is deterministic, deduplicates IDs, reports missing IDs, and honors topN", () => {
  const input = {
    companyIds: [second.id, company.id, company.id, "indian-csv:999"],
    criteria: [criterion()],
    topN: 1,
  };
  const first = scoreLoadedCompanies(input, [second, company]);
  assert.deepEqual(
    first,
    scoreLoadedCompanies({ ...input, companyIds: [...input.companyIds].reverse() }, [
      company,
      second,
    ]),
  );
  assert.equal(first.companies[0].id, company.id);
  assert.equal(first.eligible, 2);
  assert.equal(first.evaluated, 2);
  assert.deepEqual(first.missingCompanyIds, ["indian-csv:999"]);
  assert.equal("embedding" in first.companies[0], false);
});
test("details return found/not_found and strip internal and arbitrary fields", async () => {
  const internal = {
    ...company,
    embedding: [42],
    _id: "internal",
    embeddingTextHash: "hash",
    extra: "hidden",
  };
  const get = createCompanyDetails(async (id) => (id === company.id ? internal : null));
  const found = await get(company.id);
  assert.equal(found.status, "found");
  if (found.status === "found") assert.deepEqual(found.company, company);
  assert.deepEqual(await get("indian-csv:999"), {
    status: "not_found",
    companyId: "indian-csv:999",
  });
  await assert.rejects(get("bad-id"));
});

test("semantic search sends a 256-vector query to exact Vector Search with filters and stable sorting", async () => {
  let captured: Record<string, unknown>[] = [];
  const store: SearchStore = {
    count: async () => 20,
    distinct: async () => ["Private"],
    find: async () => {
      throw new Error("Must use vector search");
    },
    vector: async (pipeline) => {
      captured = pipeline;
      return [{ ...company, semanticScore: 0.9 }];
    },
  };
  const search = createCompanySearch(store, async (texts, type) => {
    assert.deepEqual(texts, ["cloud services"]);
    assert.equal(type, "query");
    return [Array(256).fill(0.1)];
  });
  const result = await search({
    filters: { companyType: ["pvt"], description: "cloud" },
    semanticQuery: "cloud services",
    limit: 500,
  });
  const stage = captured[0].$vectorSearch as Record<string, unknown>;
  assert.equal(stage.exact, true);
  assert.equal((stage.queryVector as number[]).length, 256);
  assert.deepEqual(stage.filter, { companyType: { $in: ["Private"] } });
  assert.deepEqual(captured[3], { $sort: { semanticScore: -1, id: 1 } });
  assert.deepEqual(captured[4], { $limit: 100 });
  assert.equal(result.total, 20);
  assert.equal(result.returned, 1);
  assert.equal("embedding" in result.companies[0], false);
});
test("zero-result search preserves unknown constraints, suggests relaxation and skips embedding", async () => {
  let findCalled = false;
  const store: SearchStore = {
    count: async (filter) => ("companyType" in filter ? 0 : 99),
    distinct: async () => ["Private"],
    find: async () => {
      findCalled = true;
      return [];
    },
    vector: async () => [],
  };
  const search = createCompanySearch(store, async () => {
    throw new Error("Must not embed zero-result search");
  });
  const result = await search({ filters: { companyType: ["Privat"] }, semanticQuery: "cloud" });
  assert.deepEqual(result.appliedFilters, { companyType: ["Privat"] });
  assert.deepEqual(result.unrecognized[0].didYouMean, ["Private"]);
  assert.deepEqual(result.relaxationHints, [{ removed: "companyType", wouldReturn: 99 }]);
  assert.equal(findCalled, false);
});
test("filter-only search bypasses Voyage; service errors and invalid query vectors propagate", async () => {
  let appliedLimit = 0;
  const store: SearchStore = {
    count: async () => 20,
    distinct: async () => [],
    find: async (_filter, limit) => {
      appliedLimit = limit;
      return [company];
    },
    vector: async () => [],
  };
  const search = createCompanySearch(store, async () => {
    throw new Error("Simulated Voyage failure");
  });
  assert.equal((await search({})).returned, 1);
  await search({ limit: -5 });
  assert.equal(appliedLimit, 1);
  await search({ limit: 999 });
  assert.equal(appliedLimit, 100);
  await assert.rejects(search({ semanticQuery: "cloud" }), /Voyage failure/);
  await assert.rejects(
    createCompanySearch(store, async () => [Array(1024).fill(1)])({ semanticQuery: "cloud" }),
    /Invalid query embedding/,
  );
});
