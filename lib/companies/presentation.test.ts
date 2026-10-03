import assert from "node:assert/strict";
import test from "node:test";
import { companyTables, tableCsv } from "./presentation.ts";

const company = {
  id: "indian-csv:123",
  sourceIndex: 123,
  name: 'Example, "Company"',
  description: "First line\nSecond line",
  companyType: "Private",
  location: "Delhi",
  employeeBand: "51-200",
  rating: null,
  tags: ["Software"],
  qualityFlags: ["internal"],
  source: { companyType: null, location: null, oldTime: "private", employees: null, reviews: null },
};

test("details render only public fields from MCP text output and export valid CSV", () => {
  const tables = companyTables([
    {
      type: "tool-call",
      toolName: "companies__get_company",
      result: { content: [{ type: "text", text: JSON.stringify({ status: "found", company }) }] },
    },
  ]);
  assert.equal(tables.length, 1);
  assert.deepEqual(tables[0].headers, ["Field", "Value"]);
  const csv = tableCsv(tables[0]);
  assert.ok(csv.includes('"Example, ""Company"""'));
  assert.ok(csv.includes('"First line\nSecond line"'));
  assert.ok(csv.includes('"Rating","Not available"'));
  assert.ok(!csv.includes(company.id));
  assert.ok(!csv.includes("oldTime"));
  assert.ok(!csv.includes("internal"));
});

test("ranked results preserve returned order and scores; unscored candidates stay hidden", () => {
  const tables = companyTables([
    {
      type: "tool-call",
      toolName: "companies__search_companies",
      result: { companies: [company] },
    },
    {
      type: "tool-call",
      toolName: "companies__score_companies",
      result: {
        structuredContent: {
          evaluated: 1,
          eligible: 1,
          returned: 1,
          companies: [
            {
              id: company.id,
              name: company.name,
              companyType: company.companyType,
              location: company.location,
              employeeBand: company.employeeBand,
              rating: null,
              score: 85.25,
              breakdown: [],
            },
          ],
          excludedCompanyIds: [],
          missingCompanyIds: [],
        },
      },
    },
  ]);
  assert.equal(tables.length, 1);
  assert.deepEqual(tables[0].rows[0].slice(0, 3), ["1", company.name, "85.3"]);
  assert.equal(
    companyTables([
      { type: "tool-call", toolName: "search_companies", result: { companies: [company] } },
    ]).length,
    0,
  );
});

test("failed or not-found results never become tables; CSV neutralizes formulas", () => {
  assert.deepEqual(
    companyTables([
      {
        type: "tool-call",
        toolName: "get_company",
        result: { status: "not_found", companyId: company.id },
      },
    ]),
    [],
  );
  assert.deepEqual(
    companyTables([
      {
        type: "tool-call",
        toolName: "get_company",
        result: { isError: true, structuredContent: { status: "found", company } },
      },
    ]),
    [],
  );
  assert.ok(
    tableCsv({ title: "Example", headers: ["Value"], rows: [[" =1+1"]] }).includes("' =1+1"),
  );
});
