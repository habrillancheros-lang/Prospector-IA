import assert from "node:assert/strict";
import { loadDataset } from "./load-dataset.ts";
import { embeddingText } from "../lib/companies/normalize.ts";
const companies = await loadDataset(process.argv[2]);
assert.equal(new Set(companies.map((company) => company.id)).size, companies.length);
assert.ok(companies.every((company) => company.name && embeddingText(company).trim()));
assert.ok(
  companies.every(
    (company) =>
      company.companyType !== null ||
      !company.source.companyType ||
      company.qualityFlags.includes("ambiguous_company_type"),
  ),
);
assert.ok(
  companies.every(
    (company) =>
      company.location !== null ||
      !company.source.location ||
      company.qualityFlags.includes("ambiguous_location"),
  ),
);
console.log(
  `Verified ${companies.length} normalized source records: unique IDs, non-empty embedding text, flagged ambiguous types/locations.`,
);
