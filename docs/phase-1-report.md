# Phase 1 report

Status: Phase 1 complete. Local checks and live Atlas import/vector-search verification passed. The optional Codex MCP connection is registered but has not been exercised through this session. No Phase 2 product logic or MCP business tools were added.

## Dataset adaptation

The user approved using `data/indian_companies.csv` in place of the missing Apify JSON, reviewed the profile, and authorized continuing. The dataset has 9,988 records rather than approximately 1,000. No records were synthesized, discarded, or deduplicated by name.

Stable IDs are `indian-csv:<source index>`; the full dataset is checked for unique source indexes before import. This identity is stable while source indexes are preserved; regenerated datasets must preserve indexes or use an explicit migration. The schema exposes observed name, description, recognized company type, reported location, employee band, rating, and tags. Ambiguous values remain in source fields with quality flags. There is no inferred CIN, registered state, revenue, incorporation year, director data, or numeric employee range. Ratings retain source values without asserting a scale.

Normalization yields 8 recognized types, 1,235 distinct reported locations and 11 employee labels. There are 2,322 flagged company-type values and 2,164 flagged location values. Exact vocabulary is generated from normalized data; unsupported filters are described explicitly.

## Implementation and files

- `lib/companies/schema.ts`, `normalize.ts`, `csv.ts`: canonical types, queryable field registry, normalization, embedding text and CSV parser.
- `lib/companies/db.ts`: cached runtime MongoClient using only `MONGODB_URI`; failed connections clear the cache. Runtime credentials must have read-only Atlas permissions.
- `lib/companies/embeddings.ts`: Voyage REST client, document/query input types, model `voyage-4-lite`, 256 dimensions, timeouts and strict response validation. Errors do not include response bodies.
- `scripts/import-companies.ts`: validates the entire dataset before writes; separate `MONGODB_IMPORT_URI`; unique ID and filter indexes; resumable batches of 16; model/text-hash/vector validation before reusing embeddings; Vector Search index creation and readiness check; final count, vector and search verification. Refuses unrelated collection records and incompatible existing index definitions. Completed batches remain on failure. The target must be a dedicated collection. The script does not delete records.
- `scripts/profile-dataset.ts`, `load-dataset.ts`, `verify-dataset.ts`, `build-vocabulary.ts` and `lib/companies/normalize.test.ts`: profiling, reusable source loading, full-dataset validation, vocabulary generation and focused tests.
- `agent/skills/company-vocabulary.md`: generated vocabulary.
- `scripts/mongodb-mcp.mjs`: read-only developer MCP launcher; reads the runtime URI from ignored `.env.local`, removes known application secrets from the child environment, and runs the official MongoDB MCP server through npx. This is for Codex development, not a connection registered in the product agent. Its bootstrap currently resolves the latest MCP server at startup.
- `package.json` / lockfile: approved exact `mongodb@7.7.0` pin and dataset commands. `tsconfig.json` enables TypeScript extension imports for native Node 24 scripts. `.env.example` now has empty secrets and the required database variables.

The launcher was registered in global Codex config as `company-finder-mongodb` after explicit filesystem approval. Configuration registration succeeded; the initial connection check failed because `MONGODB_URI` was absent. Credentials have since been supplied and direct runtime reads succeeded. A new Codex session may be needed to load this connection after credentials are supplied.

## Verification

Commands ran with the isolated Node 24.21.0 runtime because the shell still resolves Node 23.6.1.

| Command                                       | Result                                                                                                              |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `node scripts/build-vocabulary.ts`            | Passed; vocabulary generated from 9,988 records                                                                     |
| `node scripts/verify-dataset.ts`              | Passed; all records have unique IDs, embedding text and expected ambiguity flags                                    |
| `node --test lib/companies/normalize.test.ts` | 3 tests passed: quoted/multiline CSV parsing, ambiguous normalization and ordered/validated mocked Voyage responses |
| `node scripts/import-companies.ts --dry-run`  | Passed; no API or DB calls                                                                                          |
| `tsc --noEmit`                                | Passed                                                                                                              |
| `oxlint lib/companies scripts`                | Passed                                                                                                              |
| `oxfmt` / targeted formatting check           | Applied and checked on changed code                                                                                 |
| MongoDB driver installation                   | Sandbox DNS failure; approved network escalation succeeded                                                          |
| MCP launcher                                  | Correctly fails with missing URI; no secret printed                                                                 |

At the initial implementation checkpoint, no live embeddings had been requested or database writes performed. Live acceptance is now met; see the completed import below. A populated Voyage credential was found in untracked `.env.example` and removed; rotate it before use. Credentials belong only in ignored `.env.local`, never in the example or MCP arguments.

## Finish Phase 1

Configure locally:

```dotenv
MONGODB_URI=<read-only Atlas connection string>
MONGODB_IMPORT_URI=<Atlas connection string with import and index permissions>
MONGODB_DB=company_finder
VOYAGE_API_KEY=<rotated Voyage key>
```

Then run with Node 24+ from the repository root:

```bash
npm run dataset:verify
npm run dataset:import
```

The import command reads `.env.local`. It generates paid Voyage embeddings for any new or changed text and writes to Atlas. Live verification passed for exactly 9,988 stored records, valid 256-dimensional model vectors and a queryable Vector Search index. The optional Codex MCP connection can be checked in a fresh session.

References: [Voyage embeddings](https://docs.voyageai.com/reference/embeddings-api), [MongoDB driver index management](https://www.mongodb.com/docs/drivers/node/current/indexes/), [MongoDB MCP options](https://www.mongodb.com/docs/mcp-server/local-mcp/configuration/options/), [Codex MCP configuration](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).

## Completed live import

The user supplied Atlas credentials and authorized import. Sandbox network access failed; network escalation was approved, and Atlas/Voyage became reachable. The initial run used 1,024 dimensions and was stopped at 3,200 records when the user clarified the required 256 dimensions. The model configuration, index definition and validation tests were changed to 256. The full dataset was then re-imported, replacing the earlier vectors because their lengths failed the reuse check.

- `node --env-file=.env.local scripts/import-companies.ts`: passed, exit 0; 9,988 company records and 9,988 256-dimensional vectors stored.
- Final stored-document validation: all 9,988 records use `voyage-4-lite`; every vector contains exactly 256 finite numbers.
- `company_embedding_v1`: created, READY and queryable. A live `$vectorSearch` query returned a result.
- Runtime credential read check: passed. Atlas reported `readAnyDatabase`, a read-only role covering all databases. No write probe was performed with the runtime credential.
- `.env.local` and the raw dataset remain ignored by Git. No credentials were copied into this report.
- Import progress messages now distinguish company-record counts, generated-vector counts and dimensions per vector.

Phase 2 remains unimplemented. The application still uses the scaffold chat behavior until the core search/scoring functions and agent tools are built in their subsequent phases.
