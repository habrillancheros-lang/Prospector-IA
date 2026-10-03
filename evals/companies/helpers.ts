import { readFileSync } from "node:fs";
import type { EveEvalContext, EveEvalTurn } from "eve/evals";
import { satisfies } from "eve/evals/expect";
import { parseCsv } from "../../lib/companies/csv.ts";
import { isReturnedLocation, recommendationLinesMatch } from "./grounding.ts";
import {
  scoreOutputSchema,
  scoreInputSchema,
  searchOutputSchema,
  detailsOutputSchema,
  type Criterion,
} from "../../lib/companies/schema.ts";

export const SEARCH = "companies__search_companies";
export const SCORE = "companies__score_companies";
export const DETAILS = "companies__get_company";
const rows = parseCsv(readFileSync("data/indian_companies.csv", "utf8"));
const names = [...new Set(rows.slice(1).map((row) => row[rows[0].indexOf("names")].trim()))];

export function payload(value: unknown): unknown {
  if (typeof value === "string") {
    try {
      return payload(JSON.parse(value));
    } catch {
      return value;
    }
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (record.structuredContent) return record.structuredContent;
    if (Array.isArray(record.content)) {
      const content = record.content.find((item) => item.type === "text");
      if (content) return payload(content.text);
    }
  }
  return value;
}

export function check(t: EveEvalContext, label: string, predicate: () => boolean) {
  t.check(
    null,
    satisfies(() => {
      try {
        return predicate();
      } catch {
        return false;
      }
    }, label),
  );
}

export function business(turn: EveEvalTurn) {
  return turn.toolCalls.filter((call) => call.name.startsWith("companies__"));
}
export function input(turn: EveEvalTurn, name: string) {
  return turn.requireToolCall(name).input;
}
export function criteria(turn: EveEvalTurn): Criterion[] {
  return scoreInputSchema.parse(input(turn, SCORE)).criteria;
}
export function criterion(
  turn: EveEvalTurn,
  field: string,
  required: boolean,
  weight: number,
  value?: unknown,
) {
  return criteria(turn).some(
    (item) =>
      item.field === field &&
      item.required === required &&
      item.weight === weight &&
      (value === undefined ||
        JSON.stringify(item.value) === JSON.stringify(value) ||
        (typeof value === "string" &&
          Array.isArray(item.value) &&
          item.value.length === 1 &&
          item.value[0] === value)),
  );
}

export function grounded(
  t: EveEvalContext,
  turn: EveEvalTurn,
  mode: "rank" | "details" | "clarify",
  prompt = "",
) {
  const call = turn.requireToolCall(
    mode === "rank" ? SCORE : mode === "details" ? DETAILS : SEARCH,
  );
  const data =
    mode === "rank"
      ? scoreOutputSchema.parse(payload(call.output))
      : mode === "details"
        ? detailsOutputSchema.parse(payload(call.output))
        : searchOutputSchema.parse(payload(call.output));
  const records =
    "companies" in data ? data.companies : data.status === "found" ? [data.company] : [];
  const answer = turn.message ?? "";
  const mentionedIds = [...answer.matchAll(/indian-csv:\d+/g)].map((match) => match[0]);
  check(t, "Internal database IDs are never displayed", () => mentionedIds.length === 0);
  check(
    t,
    "Internal company tool names are never displayed",
    () => !/\b(?:companies__)?(?:search_companies|score_companies|get_company)\b/.test(answer),
  );
  if (mode === "details" && records.length > 0) {
    check(t, "Company details use a Field and Value table", () =>
      /\|\s*Field\s*\|\s*Value\s*\|\s*\n\s*\|\s*:?-{3,}:?\s*\|\s*:?-{3,}:?\s*\|/i.test(answer),
    );
  }
  if (mode === "rank") {
    check(t, "Every ranked source name appears in the answer", () =>
      records.every((company) => answer.includes(company.name)),
    );
    check(t, "Every recommendation line preserves returned order, name and rounded score", () =>
      recommendationLinesMatch(
        answer,
        records.map((company) => ({
          name: company.name,
          score: "score" in company ? Number(company.score) : NaN,
        })),
      ),
    );
    const summary = records.map((company) => ({
      id: company.id,
      name: company.name,
      score: "score" in company ? company.score : undefined,
    }));
    t.log(JSON.stringify({ ranked: summary }));
  }
  // Exact dataset-name scan plus ranked-line checks. Short generic names cannot be
  // reliably classified as company mentions by a deterministic text matcher.
  const allowedNames = records.map((company) => company.name);
  const forbidden = names.filter(
    (name) =>
      name.length >= 8 &&
      !prompt.includes(name) &&
      !isReturnedLocation(name, records) &&
      !(mode === "details" && JSON.stringify(data).includes(name)) &&
      !allowedNames.some((allowed) => allowed.includes(name)) &&
      answer.includes(name),
  );
  check(
    t,
    "Answer does not name another dataset company outside permitted output",
    () => forbidden.length === 0,
  );
  if (forbidden.length) t.log(JSON.stringify({ forbiddenNames: forbidden }));
}

export function ranked(t: EveEvalContext, turn: EveEvalTurn, prompt: string) {
  turn.succeeded();
  turn.noFailedActions();
  turn.toolOrder([SEARCH, SCORE]);
  t.loadedSkill("company-criteria");
  turn.maxToolCalls(10);
  const search = searchOutputSchema.parse(payload(turn.requireToolCall(SEARCH).output));
  const score = input(turn, SCORE);
  check(
    t,
    "Score exactly the retrieved candidate IDs",
    () =>
      JSON.stringify([...(score.companyIds as string[])].sort()) ===
      JSON.stringify(search.companies.map((company) => company.id).sort()),
  );
  check(
    t,
    "Use default candidate limit and ranked top 10",
    () => (input(turn, SEARCH).limit ?? 50) === 50 && (score.topN ?? 10) === 10,
  );
  grounded(t, turn, "rank", prompt);
}
