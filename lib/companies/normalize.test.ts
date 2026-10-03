import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv } from "./csv.ts";
import { normalizeCompany, embeddingText } from "./normalize.ts";
import { embedTexts } from "./embeddings.ts";

test("CSV preserves quoted commas, escaped quotes, multiline cells and trailing empty cells", () => {
  assert.deepEqual(parseCsv('a,b,c\r\n"a,b","say ""hi""\nnow",\r\n'), [
    ["a", "b", "c"],
    ["a,b", 'say "hi"\nnow', ""],
  ]);
  assert.throws(() => parseCsv('a,"unfinished'), /Unterminated/);
  assert.throws(() => parseCsv('"a"junk'), /Unexpected/);
});
test("normalization retains ambiguous source values without inferring missing facts", () => {
  const company = normalizeCompany({
    "": "9",
    names: " Acme ",
    company_type: "Mumbai + 4 more",
    locations: "14 years old",
    old_time: "50 employees (Global)",
    employees: "100001",
    tags: "IT, IT, SaaS,",
    ratings: "4.2",
  });
  assert.equal(company.id, "indian-csv:9");
  assert.equal(company.companyType, null);
  assert.equal(company.location, null);
  assert.equal(company.source.oldTime, "50 employees (Global)");
  assert.equal(company.employeeBand, "100001");
  assert.deepEqual(company.tags, ["IT", "SaaS"]);
  assert.deepEqual(company.qualityFlags, ["ambiguous_company_type", "ambiguous_location"]);
  assert.ok(!embeddingText(company).includes("14 years old"));
  assert.throws(() => normalizeCompany({ "": "", names: "Acme" }), /index/);
  assert.throws(() => normalizeCompany({ "": "1", names: "" }), /name/);
});
test("Voyage response is ordered by index and invalid vectors fail before storage", async () => {
  const mock =
    (data: unknown): typeof fetch =>
    async (_url, options) => {
      const request = JSON.parse(String(options?.body));
      assert.equal(request.model, "voyage-4-lite");
      assert.equal(request.output_dimension, 256);
      assert.equal(request.input_type, "document");
      return new Response(JSON.stringify({ data }));
    };
  const vectors = await embedTexts(
    ["first", "second"],
    "document",
    "test-only",
    mock([
      { index: 1, embedding: Array(256).fill(2) },
      { index: 0, embedding: Array(256).fill(1) },
    ]),
  );
  assert.equal(vectors[0][0], 1);
  assert.equal(vectors[1][0], 2);
  await assert.rejects(
    embedTexts(["first"], "document", "test-only", mock([{ index: 0, embedding: [1] }])),
    /Invalid/,
  );
});
