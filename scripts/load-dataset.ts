import { readFile } from "node:fs/promises";
import { parseCsv } from "../lib/companies/csv.ts";
import { normalizeCompany } from "../lib/companies/normalize.ts";

export async function loadDataset(path = "data/indian_companies.csv") {
  const [headers, ...rows] = parseCsv((await readFile(path, "utf8")).replace(/^\uFEFF/, ""));
  const expected = [
    "",
    "names",
    "ratings",
    "reviews",
    "company_type",
    "locations",
    "old_time",
    "employees",
    "tags",
    "decs",
  ];
  if (
    !headers ||
    headers.length !== expected.length ||
    headers.some((value, index) => value !== expected[index])
  )
    throw new Error("Unexpected dataset headers; profile the new source first");
  if (!rows.length) throw new Error("Dataset is empty");
  const ids = new Set<string>();
  return rows.map((row, index) => {
    if (row.length !== headers.length) throw new Error(`Malformed record ${index + 1}`);
    const company = normalizeCompany(
      Object.fromEntries(headers.map((header, i) => [header, row[i]])),
    );
    if (ids.has(company.id)) throw new Error(`Duplicate source ID at record ${index + 1}`);
    ids.add(company.id);
    return company;
  });
}
