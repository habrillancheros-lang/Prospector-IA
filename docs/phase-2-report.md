# Phase 2 report

Status: Phase 2 complete. Final local and live Atlas checks passed. MCP server, eve integration and UI remain subsequent phases.

## Built

- `lib/companies/search.ts`: strict validated filters, vocabulary/alias normalization, unrecognized-value suggestions, independent relaxation counts, deterministic filter-only ordering and exact 256-dimensional MongoDB Vector Search.
- `lib/companies/score.ts`: pure deterministic weighted scoring and a separate read-only database wrapper, top-10 defaults, required exclusions, full breakdowns and missing-ID reporting.
- `lib/companies/details.ts` and `public.ts`: complete normalized details, not-found response and explicit stripping of internal fields.
- `lib/companies/schema.ts`: strict input/output schemas generated from the existing queryable-field registry. Schemas export to JSON Schema for future MCP registration.
- `lib/companies/filter-values.ts`: normalization, explicit aliases and deterministic typo suggestions.
- `lib/companies/core.test.ts`: 13 core tests, alongside the 3 existing Phase 1 tests.
- `lib/companies/db.ts`: CLI cleanup helper for the cached read-only database connection.
- `scripts/try-core.ts`: real Atlas smoke tests, deterministic repeats and saved sample output.
- `package.json` and lockfile: approved exact `zod@4.6.5` direct dependency, `test:core` and `core:try` commands.
- `docs/phase-2-contract.md`: user-approved adaptation and exact implementation contract; `docs/phase-2-samples.json`: live sample outputs.

## Deviations and decisions

The spec referenced scoring §3.2, unit-test §8 and AGENTS.md hard rule 6, none of which existed. The user approved weighted fractions, unknown-zero behavior, required exclusion, word-fraction partial matches and ID tie-breaking. The conservative documented input limits fill the missing specification; no exact algorithm was invented without approval. The core uses the approved CSV fields rather than absent Apify fields.

Exact nearest-neighbor search enumerates the fixed dataset before limiting, making candidate ordering deterministic and permitting escaped text filters after the vector stage. The implementation refuses scans exceeding 20,000 pre-filtered records. This is suitable for the existing 9,988-record corpus; expansion requires revisiting the retrieval strategy. Vector similarity retrieves candidates, while criteria alone calculate scores.

Source duplicate names and truncated names remain unchanged. All three sample queries return sensible category matches, but many score ties occur with simple criteria. Exact-word scoring does not handle synonyms or verify source claims. These are documented limitations of the approved contract.

## Verification

- Native Node 24 test suite: 16 tests passed.
- `tsc --noEmit`: passed.
- Targeted `oxlint` and `oxfmt --check`: passed.
- Zod installation: offline metadata unavailable; approved network escalation succeeded without changing its already-installed version.
- Initial live smoke run: sandbox connectivity failed; approved network escalation succeeded.
- Three live semantic queries: 50 candidates and 10 scored results each; software matches include Aspire Systems and Trigent Software, banking matches include Axis Bank and Federal Bank, and pharmaceutical matches include Alembic and Win Medicare.
- Reversed candidate IDs produce identical score outputs. Repeated semantic query produces the same ordered candidate IDs.
- Details return source records without vectors; a missing ID returns `not_found`. An unknown company-type filter returns zero results with suggestions and relaxation hints.
- All runtime operations use the read-only Atlas credential. Voyage query embeddings use 256 dimensions. No collection writes or glm-5.3-flash calls are involved. Voyage embedding requests are the only model inference.

Run from the repository root with Node 24+:

```bash
npm run test:core
npm run core:try
```

The live command reads ignored `.env.local` and generates query embeddings. It saves reviewable results in `docs/phase-2-samples.json`. No credentials appear in the report or samples.

## Final live verification and repeatability finding

The final `scripts/try-core.ts` run exited 0 and saved all verification statuses as passed, including combined company-type alias, inclusive rating range, literal description filter and semantic Vector Search. Earlier full-suite runs included a TypeError during the combined check and a repeated semantic-order assertion failure. The isolated combined query returned 143 hard matches and five correctly filtered results. No raw credentials or server responses were logged.

Two direct Voyage requests with identical input produced different values in all 256 query-vector components (maximum difference approximately 0.001636). Exact Atlas search cannot guarantee identical ordering when the query vector changes. `lib/companies/embeddings.ts` now has a bounded 128-entry, 15-minute, process-local query cache, with concurrent request reuse, failure eviction and defensive vector copies. A focused test verifies reuse, copy isolation, document bypass and retry after failure. The final full suite passed with this reuse. Retrieval may vary after expiry/restart or corpus/model changes; deterministic scoring is independent of these changes for a fixed candidate set.

The sample JSON is a temporary review artifact generated by `npm run core:try`. The application does not load it, and it may be deleted after review. Apify is not needed for this dataset-only phase. Structured service-error handling/retries remain part of the later hardening phase.

Final local checks: all 16 tests, TypeScript, targeted code lint, formatting and `git diff --check` passed. No Phase 3 work started.
