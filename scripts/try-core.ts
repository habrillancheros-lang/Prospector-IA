import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { searchCompanies } from "../lib/companies/search.ts";
import { scoreCompanies } from "../lib/companies/score.ts";
import { getCompany } from "../lib/companies/details.ts";
import { closeCompanyDb } from "../lib/companies/db.ts";
import type { SearchFilters, Criterion } from "../lib/companies/schema.ts";

const cases: { query: string; filters: SearchFilters; criteria: Criterion[] }[] = [
  {
    query: "IT services and software consulting",
    filters: { companyType: ["Private"] },
    criteria: [
      { field: "companyType", op: "eq", value: "Private", weight: 1, required: true },
      {
        field: "description",
        op: "contains",
        value: "software services",
        weight: 3,
        required: false,
      },
    ],
  },
  {
    query: "banking and financial services",
    filters: { companyType: ["Public"] },
    criteria: [
      { field: "companyType", op: "eq", value: "Public", weight: 1, required: true },
      {
        field: "description",
        op: "contains",
        value: "banking financial services",
        weight: 3,
        required: false,
      },
    ],
  },
  {
    query: "pharmaceutical manufacturing and medicines",
    filters: {},
    criteria: [
      {
        field: "description",
        op: "contains",
        value: "pharmaceutical manufacturing",
        weight: 1,
        required: false,
      },
    ],
  },
];
let stage = "starting";
async function main() {
  const results = [];
  for (const sample of cases) {
    stage = `sample: ${sample.query}`;
    const candidates = await searchCompanies({
      filters: sample.filters,
      semanticQuery: sample.query,
      limit: 50,
    });
    assert.ok(candidates.returned > 0, "Sample returned no candidates");
    const input = {
      companyIds: candidates.companies.map((company) => company.id),
      criteria: sample.criteria,
      topN: 10,
    };
    const ranked = await scoreCompanies(input);
    assert.equal(ranked.returned, 10);
    assert.deepEqual(
      await scoreCompanies({ ...input, companyIds: [...input.companyIds].reverse() }),
      ranked,
      "Scoring changed with reversed candidate order",
    );
    const details = await getCompany(ranked.companies[0].id);
    assert.equal(details.status, "found");
    assert.ok(!JSON.stringify(details).includes('"embedding"'));
    console.log(
      JSON.stringify({
        query: sample.query,
        totalHardMatches: candidates.total,
        candidates: candidates.returned,
        top10: ranked.companies.map((company) => ({
          id: company.id,
          name: company.name,
          score: company.score,
          breakdown: company.breakdown.map((item) => ({
            field: item.criterion.field,
            status: item.status,
            fraction: item.fraction,
          })),
        })),
      }),
    );
    results.push({
      query: sample.query,
      filters: sample.filters,
      criteria: sample.criteria,
      search: candidates,
      ranked,
    });
  }
  stage = "unknown filter and missing details";
  const empty = await searchCompanies({ filters: { companyType: ["Privat"] } });
  assert.equal(empty.returned, 0);
  assert.ok(empty.unrecognized.length && empty.relaxationHints.length);
  assert.deepEqual(await getCompany("indian-csv:999999999"), {
    status: "not_found",
    companyId: "indian-csv:999999999",
  });
  stage = "repeated semantic order";
  const repeated = await searchCompanies({
    filters: cases[0].filters,
    semanticQuery: cases[0].query,
    limit: 50,
  });
  assert.deepEqual(
    repeated.companies.map((company) => company.id),
    results[0].search.companies.map((company) => company.id),
    "Repeated semantic query changed candidate order",
  );
  stage = "combined alias, numeric, text and semantic filters";
  const combined = await searchCompanies({
    filters: { companyType: ["pvt"], rating: { min: 4, max: 5 }, description: "software" },
    semanticQuery: "software services",
    limit: 5,
  });
  stage = "combined-filter assertions";
  assert.ok(combined.returned > 0);
  assert.deepEqual(combined.appliedFilters.companyType, ["Private"]);
  assert.ok(
    combined.companies.every(
      (company) =>
        company.companyType === "Private" &&
        company.rating !== null &&
        company.rating >= 4 &&
        company.rating <= 5,
    ),
  );
  for (const summary of combined.companies) {
    stage = "combined-filter detail verification";
    const record = await getCompany(summary.id);
    assert.ok(
      record.status === "found" && record.company.description?.toLowerCase().includes("software"),
    );
  }
  await writeFile(
    "docs/phase-2-samples.json",
    JSON.stringify(
      {
        results,
        verification: {
          repeatedSemanticOrder: "passed",
          repeatedScoring: "passed",
          zeroResultsAndHints: "passed",
          details: "passed",
          missingDetails: "passed",
          combinedAliasNumericTextVectorFilters: "passed",
        },
      },
      null,
      2,
    ) + "\n",
  );
  console.log("Live core verification passed; wrote docs/phase-2-samples.json");
}
main()
  .catch((error: unknown) => {
    console.error(
      `Live core verification failed at ${stage} (${error instanceof Error ? error.name : "unknown error"}${error instanceof TypeError ? `: ${error.message}` : ""}); no credentials or server error bodies printed.`,
    );
    process.exitCode = 1;
  })
  .finally(closeCompanyDb);
