# Phase 4 — agent quality report

Status: complete. Two full live runs verified; the repeat run’s sole failed assertion was a location/name collision in the checker, corrected and verified against captured output locally.

The agent now loads vocabulary and criteria guidance, separates hard requirements from preferences, uses field-based weights, preserves requirements across refinements, and scores every candidate from a fresh search. Recommendations preserve returned names, order and scores. Name-based details resolve through search, duplicates require a selection, zero results require consent before relaxation, and unrelated or unsupported-only requests stay within the dataset's scope.

## Files

- `agent/instructions.md`: extraction, retrieval, scoring, grounding, refinement, consent and bounded-work instructions.
- `agent/skills/company-criteria.md`: short criteria and weighting guide, separate from generated vocabulary.
- `agent/agent.ts`: supported low reasoning effort for the existing `glm-5.3-flash` model.
- `evals/evals.config.ts` and `evals/companies/*`: 15 live conversations, deterministic assertions and four local grounding tests.
- `package.json`: `eval:companies` and `test:evals` commands.
- `docs/phase-4-contract.md`: evaluation contract and platform limitations.

The shared search/scoring algorithms, read-only runtime boundary and three-business-tool MCP architecture remain unchanged. No dependency was added for this phase. Concurrent public-table and CSV-export work was preserved and its presentation rules are covered by the grounding checks.

## Validation

Run commands from the repository root with Node 24+ and the configured dev server:

| Command                  | Result                                                            |
| ------------------------ | ----------------------------------------------------------------- |
| `npm run test:core`      | 21 tests passed                                                   |
| `npm run test:evals`     | 4 tests passed                                                    |
| `npx tsc --noEmit`       | Passed                                                            |
| `npm run lint`           | Passed                                                            |
| `npm run eval:companies` | First complete passing run: 15/15 conversations, 281 gates, 5m 2s |

First passing live artifact: `.eve/evals/2026-10-03T19-09-56/summary.json` (ignored local runtime output). Earlier runs identified prompt issues and overly narrow test assertions, which were corrected. An intervening Atlas connection outage and Z.ai DNS failure also prevented live checks; MongoDB ping and the passing suite subsequently confirmed recovery. Outage runs are not counted as acceptance evidence.

Repeat run: `.eve/evals/2026-10-03T19-15-18/summary.json`, 5m 14s, raw CLI result 14/15 and 279/280 gates. Its sole flag was `Sterling`: REI Systems’ returned location, also a dataset company name. The checker now permits exact returned location components. Local replay verified that this was the only failed assertion and that the scored record supplies Sterling; a regression test covers the collision. The repeat’s behavior satisfies the contract. No third full live run was performed after correcting the checker; raw artifacts retain their original verdicts.

## Deviations and limits

The supplied spec lacks the referenced sections 5 and 8. The suite follows the user-approved Phase 2 contract and the Phase 4 playbook; its explicit baseline is `docs/phase-4-contract.md`.

Eve 0.56.0 exposes no supported per-turn tool-round cap. Instructions allow at most eight business calls and one failure retry; the loop case verifies observed bounded behavior. This is a prompt policy, not a hard runtime guard.

Grounding checks cover exact recommendation names, order, displayed scores and other detectable dataset-name mentions. They do not prove every free-text claim or detect every invented name outside the dataset. Semantic candidates may vary with model query wording and query-embedding cache expiry; scoring remains deterministic for fixed companies and criteria.

Phase 5 has not been started by this phase's work. Production deployment was not tested.
