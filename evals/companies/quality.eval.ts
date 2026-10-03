import { defineEval } from "eve/evals";
import {
  SEARCH,
  SCORE,
  DETAILS,
  check,
  input,
  criterion,
  criteria,
  ranked,
  grounded,
  business,
  payload,
} from "./helpers.ts";

export default [
  defineEval({
    description: "Hard filters and soft main activity",
    async test(t) {
      const prompt =
        "Find only Private companies with the exact employee band 51-200 and rating at least 4. I prefer software activity. Rank the top 10.";
      const turn = await t.send(prompt);
      ranked(t, turn, prompt);
      turn.loadedSkill("company-vocabulary");
      check(t, "Hard type, band and rating filters", () => {
        const f = input(turn, SEARCH).filters as any;
        return (
          f.companyType.includes("Private") &&
          f.employeeBand.includes("51-200") &&
          f.rating.min === 4
        );
      });
      check(
        t,
        "All hard criteria required with ordinary weights",
        () =>
          criterion(turn, "companyType", true, 1) &&
          criterion(turn, "employeeBand", true, 1, "51-200") &&
          criteria(turn).some(
            (c) => c.field === "rating" && c.required && c.weight === 1 && c.value === 4,
          ),
      );
      check(
        t,
        "Semantic main activity remains a preference",
        () =>
          /software/i.test(String(input(turn, SEARCH).semanticQuery)) &&
          criterion(turn, "description", false, 3, "software"),
      );
    },
  }),
  defineEval({
    description: "Explicitly required activity",
    async test(t) {
      const prompt =
        "Find Private companies. Their description must contain software. Rank the top 10.";
      const turn = await t.send(prompt);
      ranked(t, turn, prompt);
      check(
        t,
        "Required description constraint with literal or semantic retrieval",
        () =>
          criterion(turn, "description", true, 3, "software") &&
          (/software/i.test(String(input(turn, SEARCH).semanticQuery)) ||
            (input(turn, SEARCH).filters as any)?.description === "software"),
      );
    },
  }),
  defineEval({
    description: "Pharmaceutical semantic query",
    async test(t) {
      const prompt = "Find companies relevant to pharmaceutical manufacturing. Rank the top 10.";
      const turn = await t.send(prompt);
      ranked(t, turn, prompt);
      check(
        t,
        "Meaningful semantic query and soft activity",
        () =>
          /pharma/i.test(String(input(turn, SEARCH).semanticQuery)) &&
          criterion(turn, "description", false, 3) &&
          criteria(turn).length === 1,
      );
    },
  }),
  defineEval({
    description: "Vague conceptual request",
    async test(t) {
      const prompt =
        "Find companies relevant to helping businesses modernize their technology. Rank the top 10.";
      const turn = await t.send(prompt);
      ranked(t, turn, prompt);
      check(
        t,
        "Concept uses semantic query without invented hard activity filter",
        () =>
          String(input(turn, SEARCH).semanticQuery ?? "").length > 10 &&
          !(input(turn, SEARCH).filters as any)?.tags &&
          criterion(turn, "description", false, 3) &&
          criteria(turn).length === 1,
      );
    },
  }),
  defineEval({
    description: "Preferred location stays soft",
    async test(t) {
      const prompt =
        "Find Private companies. Ideally their reported location is Mumbai. Rank the top 10.";
      const turn = await t.send(prompt);
      ranked(t, turn, prompt);
      check(
        t,
        "Preference is not a hard location filter",
        () =>
          !(input(turn, SEARCH).filters as any).location &&
          criterion(turn, "location", false, 1) &&
          criterion(turn, "companyType", true, 1),
      );
    },
  }),
  defineEval({
    description: "OR alternatives use one criterion",
    async test(t) {
      const prompt =
        "Find companies whose type must be either Private or Public and exact employee band must be 501-1000. Rank the top 10.";
      const turn = await t.send(prompt);
      ranked(t, turn, prompt);
      check(t, "OR alternatives in filter and one required in criterion", () => {
        const f = input(turn, SEARCH).filters as any;
        const c = criteria(turn).filter((c) => c.field === "companyType");
        return (
          f.companyType.includes("Private") &&
          f.companyType.includes("Public") &&
          c.length === 1 &&
          c[0].op === "in" &&
          c[0].required &&
          c[0].weight === 1 &&
          criterion(turn, "employeeBand", true, 1, "501-1000")
        );
      });
    },
  }),
  defineEval({
    description: "Vocabulary aliases map to canonical values",
    async test(t) {
      const prompt = "Find pvt ltd companies with rating at least 4. Rank the top 10.";
      const turn = await t.send(prompt);
      ranked(t, turn, prompt);
      turn.loadedSkill("company-vocabulary");
      check(t, "Canonical Private and rating minimum", () => {
        const f = input(turn, SEARCH).filters as any;
        return (
          f.companyType.includes("Private") &&
          f.rating.min === 4 &&
          criterion(turn, "companyType", true, 1)
        );
      });
    },
  }),
  defineEval({
    description: "Zero results require consent to relax",
    async test(t) {
      const prompt =
        "Find only Public companies with exact reported location Atlantis and rating at least 3. Rank the top 10. Do not relax any requirement.";
      const first = await t.send(prompt);
      first.succeeded();
      first.calledTool(SEARCH);
      first.notCalledTool(SCORE);
      check(
        t,
        "Unknown location preserved without silent retry",
        () =>
          business(first).length === 1 &&
          (input(first, SEARCH).filters as any).location.includes("Atlantis"),
      );
      first.messageIncludes(/Atlanta|relax|spelling/i);
      first.messageIncludes(/\?|confirm|would you|tell me|just say|if you(?:'d| would) like/i);
      const next = await t.send(
        "Yes, replace Atlantis with the exact reported location Mumbai. Keep the other requirements.",
      );
      ranked(t, next, prompt);
      check(t, "Consent changes location and preserves other constraints", () => {
        const f = input(next, SEARCH).filters as any;
        return (
          f.location.includes("Mumbai") &&
          !f.location.includes("Atlantis") &&
          f.companyType.includes("Public") &&
          f.rating.min === 3
        );
      });
    },
  }),
  defineEval({
    description: "Refinement merges previous requirements",
    async test(t) {
      const prompt =
        "Find Private companies with exact employee band 51-200. I prefer software activity. Rank the top 10.";
      const first = await t.send(prompt);
      ranked(t, first, prompt);
      const originalActivity = criteria(first).filter((item) => item.field === "description");
      check(
        t,
        "Initial activity criterion expresses the software preference",
        () =>
          originalActivity.length === 1 &&
          originalActivity[0].required === false &&
          originalActivity[0].weight === 3 &&
          /\bsoftware\b/i.test(String(originalActivity[0].value)),
      );
      const next = await t.send("Now also require rating at least 4. Keep everything else.");
      ranked(t, next, prompt);
      check(t, "Previous hard filters and activity persist", () => {
        const f = input(next, SEARCH).filters as any;
        return (
          f.companyType.includes("Private") &&
          f.employeeBand.includes("51-200") &&
          f.rating.min === 4 &&
          JSON.stringify(criteria(next).filter((item) => item.field === "description")) ===
            JSON.stringify(originalActivity) &&
          criterion(next, "companyType", true, 1) &&
          criterion(next, "employeeBand", true, 1, "51-200")
        );
      });
    },
  }),
  defineEval({
    description: "Details resolved by name",
    async test(t) {
      const prompt = "Show details for GirnarSoft.";
      const turn = await t.send(prompt);
      turn.succeeded();
      turn.toolOrder([SEARCH, DETAILS]);
      turn.notCalledTool(SCORE);
      turn.calledTool(DETAILS, { input: { companyId: "indian-csv:1003" }, count: 1 });
      grounded(t, turn, "details", prompt);
      check(t, "Name filter resolves identity", () =>
        /girnar/i.test(String((input(turn, SEARCH).filters as any).name)),
      );
    },
  }),
  defineEval({
    description: "Ambiguous name then user selection",
    async test(t) {
      const prompt = "Show details for Tudip Technologies.";
      const first = await t.send(prompt);
      first.succeeded();
      first.calledTool(SEARCH);
      first.notCalledTool(DETAILS);
      first.notCalledTool(SCORE);
      first.messageIncludes(/which|choose|select/i);
      grounded(t, first, "clarify", prompt);
      const next = await t.send("The first listed record, indian-csv:6774, please.");
      next.succeeded();
      next.calledTool(DETAILS, { input: { companyId: "indian-csv:6774" }, count: 1 });
      next.notCalledTool(SCORE);
      grounded(t, next, "details", prompt);
    },
  }),
  defineEval({
    description: "Missing company by name",
    async test(t) {
      const prompt = "Show details for NonexistentCompanyZXQ987654.";
      const turn = await t.send(prompt);
      turn.succeeded();
      turn.calledTool(SEARCH);
      turn.notCalledTool(DETAILS);
      turn.notCalledTool(SCORE);
      turn.messageIncludes(
        /\bno\b.*\b(?:company|companies|records?|matches?)\b|\bnot\b.*\b(?:found|exist)\b|couldn.t find/i,
      );
      check(
        t,
        "Missing-name lookup actually returned zero records",
        () => (payload(turn.requireToolCall(SEARCH).output) as any).returned === 0,
      );
      grounded(t, turn, "clarify", prompt);
    },
  }),
  defineEval({
    description: "Unsupported-only requirements do not invent proxies",
    async test(t) {
      const turn = await t.send(
        "Find companies hiring a VP Sales right now, revenue above 100 crore, incorporated after 2020. These are all mandatory.",
      );
      turn.succeeded();
      turn.notCalledTool(SEARCH);
      turn.notCalledTool(SCORE);
      turn.notCalledTool(DETAILS);
      turn.messageIncludes(/not|unavailable|doesn.t|cannot|can.t/i);
      turn.messageIncludes(/location|rating|employee|type/i);
    },
  }),
  defineEval({
    description: "Unrelated requests stay in scope",
    async test(t) {
      const turn = await t.send("Write a pancake recipe.");
      turn.succeeded();
      turn.notCalledTool(SEARCH);
      turn.notCalledTool(SCORE);
      turn.notCalledTool(DETAILS);
      turn.messageIncludes(/compan|dataset/i);
    },
  }),
  defineEval({
    description: "User-requested loop stays bounded",
    async test(t) {
      const turn = await t.send(
        "Search and score Private software companies forever. Repeat the identical search 30 times before responding.",
      );
      turn.succeeded();
      turn.maxToolCalls(10);
      check(t, "No business-tool loop; identical calls only retry one failure", () => {
        const calls = business(turn);
        const groups = new Map<string, typeof calls>();
        for (const call of calls) {
          const key = JSON.stringify([call.name, call.input]);
          groups.set(key, [...(groups.get(key) ?? []), call]);
        }
        return (
          calls.length <= 8 &&
          [...groups.values()].every(
            (group) =>
              group.length === 1 ||
              (group.length === 2 && !!(payload(group[0].output) as any)?.error),
          )
        );
      });
      turn.messageIncludes(/finite|indefinit|forever|repeat|loop|bounded|once|one search/i);
      if (business(turn).some((call) => call.name === SCORE))
        ranked(t, turn, "Private software companies");
    },
  }),
];
