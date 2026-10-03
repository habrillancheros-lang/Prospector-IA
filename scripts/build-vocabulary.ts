import { mkdir, writeFile } from "node:fs/promises";
import { loadDataset } from "./load-dataset.ts";
const companies = await loadDataset(process.argv[2]);
const distinct = (values: (string | null)[]) =>
  [...new Set(values.filter((value): value is string => value !== null))].sort((a, b) =>
    a.localeCompare(b, "en"),
  );
const types = distinct(companies.map((company) => company.companyType));
const locations = distinct(companies.map((company) => company.location));
const bands = distinct(companies.map((company) => company.employeeBand));
const flagCounts = new Map<string, number>();
for (const company of companies)
  for (const flag of company.qualityFlags) flagCounts.set(flag, (flagCounts.get(flag) ?? 0) + 1);
const content = [
  "---",
  "description: Exact filter vocabulary and coverage limits for the supplied Indian company CSV.",
  "---",
  "",
  "# Company vocabulary",
  "",
  `Generated from ${companies.length} source records. Do not edit manually.`,
  "",
  "Use exact values below for hard filters. Locations are reported locations, not registered states. Employee bands are source labels; numeric-only bands have undocumented bounds. Do not infer age, incorporation year, revenue, hiring activity or CIN. Duplicate names refer to separate source records; use IDs for details.",
  "",
  "Ambiguous company types and location values are excluded from filter vocabulary and preserved in source data. Tags and descriptions support semantic search, not verified claims.",
  "",
  ...[
    ["Company types", types],
    ["Employee bands", bands],
    ["Reported locations", locations],
  ].flatMap(([label, values]) => [
    `## ${label}`,
    "",
    ...(values as string[]).map((value) => `- ${value}`),
    "",
  ]),
];
await mkdir("agent/skills", { recursive: true });
await writeFile("agent/skills/company-vocabulary.md", content.join("\n"));
console.log(
  JSON.stringify({
    records: companies.length,
    companyTypes: types.length,
    locations: locations.length,
    employeeBands: bands.length,
    qualityFlags: Object.fromEntries(flagCounts),
  }),
);
