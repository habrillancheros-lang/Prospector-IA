import { detailsOutputSchema, scoreOutputSchema } from "./schema.ts";

export type CompanyTable = {
  title: string;
  headers: string[];
  rows: string[][];
};

function unwrap(value: unknown, depth = 0): unknown {
  if (depth > 8) return undefined;
  if (typeof value === "string") {
    try {
      return unwrap(JSON.parse(value), depth + 1);
    } catch {
      return undefined;
    }
  }
  if (!value || typeof value !== "object") return value;
  const object = value as Record<string, unknown>;
  if (object.isError) return undefined;
  if (object.structuredContent) return unwrap(object.structuredContent, depth + 1);
  if (Array.isArray(object.content)) {
    for (const block of object.content) {
      if (block?.type === "text") {
        const parsed = unwrap(block.text, depth + 1);
        if (parsed) return parsed;
      }
    }
    return undefined;
  }
  return value;
}

const display = (value: string | number | null) =>
  value === null || value === "" ? "Not available" : String(value);

const fieldLabels = {
  companyType: "Company type",
  location: "Reported location",
  employeeBand: "Employee band",
  rating: "Rating",
  name: "Name",
  description: "Description",
  tags: "Tags",
};

export function companyTables(
  parts: readonly { type: string; toolName?: string; result?: unknown }[],
): CompanyTable[] {
  let ranked: CompanyTable[] = [];
  const details: CompanyTable[] = [];
  for (const part of parts) {
    if (part.type !== "tool-call") continue;
    const value = unwrap(part.result);
    if (part.toolName === "companies__score_companies" || part.toolName === "score_companies") {
      const parsed = scoreOutputSchema.safeParse(value);
      if (!parsed.success) continue;
      ranked = parsed.data.companies.length
        ? [
            {
              title: "Matching companies",
              headers: [
                "Rank",
                "Company",
                "Score",
                "Company type",
                "Reported location",
                "Employee band",
                "Rating",
                "Match summary",
              ],
              rows: parsed.data.companies.map((company, index) => [
                String(index + 1),
                company.name,
                String(Math.round(company.score * 10) / 10),
                display(company.companyType),
                display(company.location),
                display(company.employeeBand),
                display(company.rating),
                company.breakdown
                  .map((item) => `${fieldLabels[item.criterion.field]}: ${item.status}`)
                  .join("; ") || "Not available",
              ]),
            },
          ]
        : [];
    }
    if (part.toolName === "companies__get_company" || part.toolName === "get_company") {
      const parsed = detailsOutputSchema.safeParse(value);
      if (!parsed.success || parsed.data.status !== "found") continue;
      const company = parsed.data.company;
      details.push({
        title: company.name,
        headers: ["Field", "Value"],
        rows: [
          ["Name", company.name],
          ["Description", display(company.description)],
          ["Company type", display(company.companyType)],
          ["Reported location", display(company.location)],
          ["Employee band", display(company.employeeBand)],
          ["Rating", display(company.rating)],
          ["Tags", company.tags.length ? company.tags.join(", ") : "Not available"],
        ],
      });
    }
  }
  return details.length ? details : ranked;
}

export function tableCsv(table: CompanyTable): string {
  const escape = (text: string) => {
    // Spreadsheet apps may ignore whitespace and control characters before formulas.
    // eslint-disable-next-line no-control-regex
    const value = /^[\s\u0000-\u001f]*[=+@-]/.test(text) ? `'${text}` : text;
    return `"${value.replaceAll('"', '""')}"`;
  };
  return (
    "\uFEFF" +
    [table.headers, ...table.rows].map((row) => row.map(escape).join(",")).join("\r\n") +
    "\r\n"
  );
}
