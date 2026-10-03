# Phase 2 — approved CSV core contract

This contract adapts the original Apify-oriented tool design to the actual Phase 1 CSV fields. The supplied spec has no §3.2 scoring algorithm or §8 unit-test list, and AGENTS.md has no hard rule 6 with input limits. The user explicitly approved the deterministic scoring contract and an exact Zod pin before implementation. This document is authoritative for the implemented core functions and their subsequent MCP schemas.

## Search

`searchCompanies({ filters?, semanticQuery?, limit? })`:

```ts
filters: {
  companyType?: string[];
  location?: string[];
  employeeBand?: string[];
  rating?: { min?: number; max?: number };
  name?: string;
  description?: string;
  tags?: string[];
}
```

Hard filters combine with AND across fields and OR within arrays. Numeric ranges are inclusive, require at least one finite bound, and reject reversed bounds. Name and description filters are escaped, case-insensitive literal substring searches. These hard text filters differ from word-based soft scoring criteria.

Categorical values and tags are resolved against the actual non-null database vocabulary. Values are case/whitespace normalized, with a small explicit alias map for company types and certain city/state labels. Exact observed values take precedence over aliases. Unknown values remain constraints; they are reported with up to three edit-distance suggestions and never silently dropped or auto-corrected. Unknown fields are rejected. A mixture of valid and unknown array values retains normal OR semantics.

`limit` defaults to 50 and is clamped to 1–100 after integer validation. Filter arrays contain 1–20 non-empty strings of at most 500 characters; hard text filters use the same string limit. `semanticQuery` is a trimmed non-empty string of at most 2,000 characters.

When a semantic query exists and hard filters have matches, Voyage produces a query embedding with `voyage-4-lite`, `input_type: query`, and 256 dimensions. MongoDB `$vectorSearch` uses exact nearest neighbors. On this fixed dataset, it enumerates all pre-filtered candidates (maximum 20,000) before applying unsupported text pre-filters as a subsequent `$match`, sorting by semantic similarity descending and ID ascending, and taking the requested limit. Enumerating the small dataset also makes ties at the limit boundary deterministic. Categorical, array and numeric filters are included inside `$vectorSearch`; regex filters cannot be used there. No glm-5.3-flash LLM participates.

Voyage query vectors can vary between identical requests: a live comparison found changes in all 256 components, with maximum absolute difference about 0.001636. A bounded, process-local cache reuses up to 128 query embeddings for 15 minutes, keyed by model, dimensions and exact text. Concurrent identical requests share the pending embedding call; failed entries are removed and returned vectors are copied. This stabilizes repeats within that cache window and reduces API requests. Semantic membership/order can still change after cache expiry, restart, index updates or model changes; strict determinism applies to scoring for the same records and criteria, and retrieval ordering for the same query vector and index.

Without a semantic query, search uses ordinary MongoDB filtering with ID-ascending order. `total` is the number of records matching hard filters, not a semantic relevance count. Semantic search has no minimum-similarity cutoff. Embeddings and internal metadata are never returned. Semantic similarity is included as `semanticScore` on search summaries but is not part of deterministic criteria scoring.

When fewer than 10 hard matches exist, search counts the results from removing each filter individually and returns only hints that increase the count. Hints do not change the actual query. A zero-hard-match search skips the embedding API entirely. Index synchronization delays can temporarily make the returned semantic count smaller than the hard-match total.

## Scoring

`scoreCompanies({ companyIds, criteria, topN? })` fetches records read-only and delegates to `scoreLoadedCompanies(input, records)`, a pure deterministic function.

Each criterion has `{ field, op, value, weight, required }`. Valid field/operator/value combinations are generated from `QUERYABLE_FIELDS`:

| Field type   | Operators                     | Value                                                      |
| ------------ | ----------------------------- | ---------------------------------------------------------- |
| Categorical  | `eq`, `in`                    | string or non-empty string array                           |
| Number       | `eq`, `gte`, `lte`, `between` | finite number or `{ min, max }` with finite ordered bounds |
| Text         | `contains`                    | non-empty string                                           |
| String array | `contains`, `in`              | exact element string or array of alternative elements      |

Criteria are limited to 1–20. Each weight is finite, greater than zero, and at most 100, defaulting to 1. `required` defaults to false. Candidate IDs are limited to 1–100, use the `indian-csv:<digits>` format, and are deduplicated before evaluation. `topN` defaults to 10 and accepts integers from 1–100. These conservative limits fill the missing original limits; they are explicitly documented rather than attributed to AGENTS.md.

For categorical and string-array criteria, any case-normalized exact match gives fraction 1; no match gives 0. Explicit aliases are supported for categorical criteria. Numeric comparisons and ranges give 1 or 0. For `contains` on text, normalize Unicode/case, split into letter/number words, deduplicate requested words, and divide the number of requested words present in the observed field by the total requested word count. Matching uses whole words, not substrings; there is no stemming, synonym expansion, stopword removal or inferred semantic scoring.

Null values and empty arrays give fraction 0 and status `unknown`. Other fractions map to `match` (1), `partial` (between 0 and 1), or `miss` (0). If a required criterion has fraction less than 1, exclude the company; required partial matches and unknowns also exclude it.

For eligible companies:

```text
criterion contribution = 100 × weight × fraction / sum(all criterion weights)
score = sum(criterion contributions), capped at 100 for floating-point arithmetic
```

Unknown criteria stay in the denominator. Scores retain full numerical precision; presentation can round them later. Sort by score descending, then company ID lexicographically ascending. No embedding similarity, LLM, random behavior or input ordering changes the score. Scores are requirement-match percentages under these rules, not calibrated confidence, business quality or evidence of hiring intent.

The output includes evaluated/eligible/returned counts, ranked company summaries and breakdowns with the criterion, actual field value, status, fraction and contribution. Missing IDs and excluded IDs are reported separately. The top 10 can contain duplicate company names because they refer to separate source records with different IDs. No name-based merging occurs.

## Details and validation

`getCompany(id)` returns `{ status: 'found', company }` or `{ status: 'not_found', companyId }`. It returns the normalized profile including preserved source values and quality flags. It removes `_id`, embedding vectors, embedding model/text-hash metadata, and arbitrary extra document fields through an explicit public-field projection.

All input and output objects use strict Zod schemas. Input schemas export successfully as JSON Schema for later MCP registration. Invalid input is rejected before database access; unknown or mismatched operators and values are rejected. Runtime functions only read MongoDB and may request Voyage embeddings. No tools, MCP route, eve wiring, or UI were added in Phase 2. Service failures propagate to the caller; structured tool/UI error handling remains a later-phase responsibility.

## Test matrix

Automated core tests cover strict schemas and limits; injection attempts; JSON Schema export; AND/OR filters; numeric bounds; regex escaping; aliases and typo suggestions; weighted scoring; partial matches and unknown values; required exclusion; exact array matching; deterministic ties and reordered candidates; duplicate/missing IDs; top-N; details found/not-found and internal-field stripping; mocked Voyage query vectors and failures; 256-dimensional validation; Vector Search pipeline structure; unknown-filter preservation and relaxation; filter-only search; and zero-result embedding avoidance. Phase 1 CSV/normalization/embedding-client tests remain in the suite.

Live checks use software services, public banking/finance, and pharmaceutical manufacturing. They verify top-10 scoring with breakdowns, repeat scoring in reversed ID order, repeat semantic candidate order, details, unknown-filter/zero-result hints, missing IDs, and combined alias/numeric/text/semantic filters. Results are recorded in `docs/phase-2-samples.json`.

References: [MongoDB Vector Search exact queries and pre-filters](https://www.mongodb.com/docs/vector-search/query/aggregation-stages/vector-search-stage/), [Zod schema APIs](https://zod.dev/api).
