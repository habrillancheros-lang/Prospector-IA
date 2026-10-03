# Codex Playbook — Company Finder

How to use: paste the **Kickoff prompt** at the start of every session, then **one phase prompt**. Run each phase in a fresh session, review, commit, then continue. Do not give Codex this whole file.

## Human checklist (before Phase 0)

- [ ] Node.js 24+ installed
- [ ] `data/companies.json` or `.csv` (the ~1,000 companies) placed in the repo's `data/` folder. Codex must not invent it.
- [ ] MongoDB Atlas cluster created; connection string ready. Vector Search capabilities enabled.
- [ ] A model credential for the agent: glm-5.3-flash API key (`GLM_API_KEY` or configured via AI Gateway).
- [ ] A model credential for embeddings: Voyage AI API key (`VOYAGE_API_KEY`) for `voyage-4-lite`.
- [ ] Vercel account (for deploy). Optional: GitHub repo
- [ ] `AGENTS.md` at repo root, and `docs/01-spec.md` + `docs/02-playbook.md` in `docs/`
- [ ] If the old LeadLens docs are in the repo: move them to `docs/legacy/`
- [ ] For Claude Code add `CLAUDE.md` with one line: `@AGENTS.md`. Codex reads `AGENTS.md` directly.

---

## Kickoff prompt (paste at the start of every session)

You are building "Company Finder": a ChatGPT-style chat app (assistant-ui frontend, Vercel eve agent backend) where users describe the companies they want, and an agent searches a fixed MongoDB database of ~1,000 companies, scores the candidates against the user's request, and returns the top 10 with explanations.

Before doing anything:

1. Read `AGENTS.md` fully. Its hard rules and stop-and-ask triggers override anything I say in this session.
2. Read only the docs the phase names.
3. eve and assistant-ui are new and pre-1.0. Do not rely on memory. After eve is installed, read `node_modules/eve/docs`; for assistant-ui use https://www.assistant-ui.com/llms.txt. If reality differs from our docs, record it in `docs/00-findings.md` and ask me.
4. Inspect the existing code before writing anything. Reuse the template's conventions. Do not add dependencies without asking.

Work only on the phase I give you. Do not start the next one. Finish with a Phase Report: what you built, files changed, commands run and their results, deviations (with reasons), open questions.

---

## Phase 0 — Scaffold and findings (no custom logic)

PROMPT:

Phase 0: scaffold and learn the platform. Read `AGENTS.md` (Stack section).

Tasks:

1. Scaffold with `npx create-assistant-ui@latest -t eve company-finder` (or into the current repo if one already exists; ask me if unclear). Use the template's package manager. Pin versions.
2. Configure the model credentials via `.env.local` for glm-5.3-flash (`GLM_API_KEY`) and Voyage AI (`VOYAGE_API_KEY`). Ask me if you need me to sign in.
3. Run the dev server, send one message in the browser UI, and confirm it streams a reply. Also confirm the eve terminal UI works if available.
4. Read the bundled eve docs and assistant-ui docs. Write `docs/00-findings.md` answering, with file/doc references:
   a. exact project layout the template produced; Node/eve/assistant-ui versions
   b. how `defineTool`, `agent.ts`, skills and connections are declared in this eve version
   c. how `defineMcpClientConnection` works (auth/headers/`tools.allow`), how remote tools are named and discovered by the model
   d. how the eve channel is secured, and what the default channel allows
   e. how assistant-ui renders tool calls and how to register custom tool UIs (generative UI)
   f. how to host an MCP server route in this Next.js/Vercel setup (which package, which file path)
   g. any difference from `docs/01-spec.md`
5. Do not write product code. Do not remove the template's example tool yet.

Acceptance: app runs, chat streams, `docs/00-findings.md` complete and accurate.

---

## Phase 1 — Dataset, schema, import, vocabulary

PROMPT:

Phase 1: dataset. Read `AGENTS.md`, `docs/01-spec.md` §2, `docs/00-findings.md`.

_Architecture Note:_ We are using the pre-seeded Kaggle CSV (`data/companies.csv`) as our primary local database for vector search. Apify will be integrated later as an on-demand fallback or enrichment tool for deep queries.

Tasks:

1. Look for `data/companies.csv` (which contains the Kaggle dataset). If missing, STOP and tell me. Never invent or synthesize companies.
2. Write `scripts/profile-dataset.ts` using a CSV parser to read `data/companies.csv`, and run it to produce `docs/dataset-profile.md` (fields, inferred types, distinct counts for categorical columns, null rates). Then STOP and show me a summary, flagging anything ambiguous. Wait for my confirmation before continuing.

After I confirm: 3. Define the canonical `Company` type and `QUERYABLE_FIELDS` in `lib/companies/schema.ts` based strictly on the CSV headers. 4. Write `lib/companies/normalize.ts` (casing, number parsing, arrays, nulls, alias map, stable string ids) with unit tests using small hand-written fixtures. 5. Write `lib/companies/db.ts` (cached MongoClient for serverless, `getCompaniesCollection()`, read helpers only). 6. Write `scripts/import-companies.ts`. This script MUST: read the CSV; concatenate text fields into a single string; call the Voyage AI API (`voyage-4-lite`) **explicitly requesting an output dimension of 256**; store the resulting vector as `embedding`; and create the MongoDB Vector Search index along with standard categorical/numeric indexes. Run it against Atlas. 7. Write `scripts/build-vocabulary.ts` generating `agent/skills/company-vocabulary.md` with `description` frontmatter and valid values/ranges/aliases/dataset size (spec §2.6). Run it.

Acceptance: collection has the expected count; all docs have a 256-dimensional voyage-4-lite embedding vector; MongoDB Vector Search index created; normalization tests pass; no secrets committed.
---

## Phase 2 — Core library: search, score, details (pure + tested)

PROMPT:

Phase 2: core logic. Read `AGENTS.md`, `docs/01-spec.md` §3 (all of it), `docs/dataset-profile.md`.

Tasks:

1. `lib/companies/search.ts`: `searchCompanies(input)` per §3.1. When `semanticQuery` is provided, generate an embedding for it using `voyage-4-lite` and execute a MongoDB `$vectorSearch` pipeline. Combine this with AND across hard filter fields, OR within arrays, alias normalization, `unrecognized` with `didYouMean`, `relaxationHints` when total is 0 (or very small), deterministic order, limit clamp.
2. `lib/companies/score.ts`: `scoreCompanies(input)` per §3.2 as pure scoring over loaded docs, with the exact algorithm. Keep the pure scoring function separate from the DB fetch so it is testable without a database.
3. `lib/companies/details.ts`: `getCompany(id)` returning the normalized record or `not_found`; strip internal fields and embedding arrays.
4. Zod input/output schemas for all three in `lib/companies/schema.ts`, generated from `QUERYABLE_FIELDS`; strict, with the limits from `AGENTS.md` hard rule 6.
5. Unit tests: every test listed in spec §8 (Unit). Mock the Voyage API call in tests.
6. A script `scripts/try-core.ts` that runs a few sample semantic queries against Atlas and prints results (for me to eyeball). Run it.

Do NOT build MCP, eve tools, or UI in this phase. No glm-5.3-flash LLM involved anywhere in this phase.

Acceptance: all tests pass; `tsc --noEmit` clean; sample runs return sensible semantic top 10 with breakdowns; scoring is fully deterministic.

---

## Phase 3 — MCP server and eve wiring (with gated fallback)

PROMPT:

Phase 3: expose the three functions via MCP and connect the agent. Read `AGENTS.md`, `docs/01-spec.md` §4 and §7, `docs/00-findings.md`.

1. Implement the MCP server route (path/package per `docs/00-findings.md` §f; verify against current Vercel and MCP SDK docs). Register exactly three tools `search_companies`, `score_companies`, `get_company` using the Zod schemas from Phase 2; handlers call the core library only. Require `Authorization: Bearer ${MCP_API_KEY}` with a constant-time compare; return structured errors; no stack traces.
2. Test the MCP server independently (e.g., with the MCP Inspector or a small script): list tools, call each, confirm schema validation rejects bad input and the bearer check works.
3. Create `agent/connections/companies.ts` with `defineMcpClientConnection` pointing at `MCP_SERVER_URL`, with the bearer token, a clear `description`, and `tools.allow` set to the three tool names.
4. Write a first `agent/instructions.md` implementing spec §5 (you will refine it in Phase 4). Keep `agent/skills/company-vocabulary.md` in place.
5. Remove the template's example weather tool (and its mention in instructions).
6. Verification (run in the eve terminal UI and via the browser): try 5 queries. Confirm in the traces/logs that glm-5.3-flash discovers the MCP tools and calls `search_companies` (with semantic queries when appropriate) then `score_companies`, and that follow-up "details" calls `get_company`.
7. DECISION GATE: if tool discovery is unreliable, or auth/URL resolution fails locally or in a Vercel preview deploy, switch to the fallback in spec §4.5. Report exactly what failed and what you switched to. Never register both.

Acceptance: from a chat message the agent completes search → score → answer using real DB data and vector search; MCP route works standalone.

> **Architecture Note:** The primary company database comes from the pre-seeded Kaggle CSV (`data/companies.csv`). However, ensure the `get_company` tool or agent logic leaves room for an optional Apify fallback call if deep or missing registry data needs to be fetched dynamically later.
> Tasks:

---

## Phase 4 — Agent quality: instructions, vocabulary use, evals

PROMPT:

Phase 4: agent quality. Read `AGENTS.md`, `docs/01-spec.md` §5 and §8 (evals), the current `agent/instructions.md`, `agent/skills/company-vocabulary.md`.

Tasks:

1. Refine `agent/instructions.md` to implement spec §5 completely: requirement extraction (hard vs soft), mapping through the vocabulary, vector search usage for vague/conceptual criteria, search with hard filters, score with all stated requirements, response shape, relaxation behavior on zero results, refinement merging, scope handling, brevity, no invented facts.
2. Add one skill `agent/skills/` file if useful (e.g., "how to translate a request into criteria with weights") with `description` frontmatter. Keep it short; do not duplicate the vocabulary.
3. Build the eval suite from spec §8 (at least 12 scripted conversations). Assertions are on tool names, arguments (semanticQuery, filters, `required` flags, weights) and order, and on the final text not naming companies absent from tool output.
4. Run the evals, fix instructions or schemas (not scoring logic) until they pass reliably. If a failure points to a scoring/spec problem, STOP and report instead of patching around it.
5. Add a per-turn tool-round cap in the agent config if supported; confirm behavior on a looping case.

Acceptance: evals pass on repeated runs; zero-result and vague-query cases behave as specified; the agent never presents an unscored company.

---

## Phase 5 — Frontend (assistant-ui)

PROMPT:

Phase 5: frontend. Read `AGENTS.md`, `docs/01-spec.md` §6, `docs/00-findings.md` §e, and the assistant-ui Generative UI docs.

Tasks:

1. Keep the Eve template's thread/composer/streaming. Rebrand: app name, title, empty-state copy.
2. Welcome screen with 4 example queries drawn from the real dataset's vocabulary (verify each returns results). Clicking sends the message.
3. Register tool UIs per spec §6 for `score_companies` (criteria chips, ranked result cards with score bar, matched/partial/missed/unknown chips from `breakdown`, "View details" button that sends a user message), `get_company` (detail card), and `search_companies` (compact status). Use whichever tool names the runtime actually exposes.
4. States: tool loading, tool error, zero results, partial results (<10). Never show raw JSON by default.
5. Responsive, light/dark, keyboard accessible. Make the results card genuinely polished: spacing, hierarchy, readable score visualization.
6. Verify in the browser with the 4 example queries plus one refinement turn and one details click.

Acceptance: the full flow works in the browser. No console errors. Layout holds on mobile width.

---

## Phase 6 — Hardening

PROMPT:

Phase 6: security, cost and reliability. Read `AGENTS.md` hard rules, `docs/01-spec.md` §7, `docs/00-findings.md` §d.

Tasks:

1. Channel auth: implement an app-level shared access code in `agent/channels/eve.ts`. The code comes from an env var (`EVE_CHANNEL_SECRET`), compared in constant time.
2. MCP route hardening: bearer auth verified, strict body size limit, no wildcard CORS, rate limit if the platform supports it simply.
3. Error handling: DB timeouts and API failures (including Voyage AI rate limits) return structured errors to the model/UI; the agent tells the user plainly and offers retry. Verify by simulating a failure.
4. Cost guards: tool-round cap, max input length for the composer, confirm glm-5.3-flash usage is sane for cost.
5. Logging: no secrets, no full URIs, no raw user data dumps.
6. Grep the repo and git history for secrets; confirm `.env*` ignored and `.env.example` complete.

Acceptance: requests to the deployed agent without the access code, and to the MCP route without the bearer token, are rejected; simulated DB/API failure handled gracefully; no secrets in git.

---

## Phase 7 — Deploy, README, demo

PROMPT:

Phase 7: ship. Read `AGENTS.md`, `docs/01-spec.md`, `docs/00-findings.md`.

Tasks:

1. Deploy to Vercel (single project). Set env vars (`MONGODB_URI`, `MONGODB_DB`, `GLM_API_KEY`, `VOYAGE_API_KEY`, `MCP_API_KEY`, `MCP_SERVER_URL` = deployment URL, channel auth secrets). Ask me for anything that needs my Vercel login.
2. Smoke-test production: 4 example queries, one refinement, one details click, an auth-rejection check, and MCP `tools/list` with and without the token.
3. Write `README.md`: what it is, architecture diagram, stack, setup (env vars, import, vector embedding generation, vocabulary build), how scoring works, how the MCP server can be used from another MCP client, how to run tests/evals, and known limitations.
4. Final audit: full test suite + evals pass; docs match the code; report any drift and fix it.

Acceptance: a fresh clone follows the README to a running app; production smoke tests pass; no secrets in git.

---

## If the agent goes off track

- It invents companies, dataset fields, model IDs or eve/assistant-ui APIs: stop it.
- It lets the model compute or adjust a score, or re-rank results in prose: revert. Hard rule 1.
- It bypasses MongoDB Vector Search or Voyage AI for embeddings: revert.
- It adds a 4th tool, writes to the DB at runtime, or exposes an unauthenticated endpoint: revert.
- It registers both MCP connection and native tools: remove one.
- It starts the next phase: tell it to finish and report only the current one.
