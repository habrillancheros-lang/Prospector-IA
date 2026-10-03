# Spec — Company Finder

## 1. Product behavior

1. User types a request in natural language.
2. The agent (glm-5.3-flash) converts it into:
   - **Filters** (hard constraints used to narrow the DB),
   - **Semantic Query** (the text to vectorize for semantic search), and
   - **Criteria** (every requirement the user stated, each with a weight; used for scoring).
3. Agent calls `search_companies` → Voyage AI (`voyage-4-lite`) creates an embedding of the semantic query → MongoDB Vector Search + filter query executes → candidate ids.
4. Agent calls `score_companies` with those ids + the criteria → ranked top 10.
5. Agent replies briefly while the UI renders the ranked results from the tool output.
6. User can ask for details or refine. The agent re-runs steps 2–5 with merged requirements.

The app only knows the predefined companies. If asked for anything outside the DB, say so.

## 2. Dataset, Schema, and Embeddings

**The human supplies `data/indian_companies.csv` containing the raw JSON output from the `foxlabs/indian-company-data` Apify actor.**

Procedure (Phase 1):

1. `scripts/profile-dataset.ts` writes `docs/dataset-profile.md` to analyze the Apify output (null rates, distinct states, revenue bands).
2. Define the canonical `Company` type based on the Apify schema. Mandatory fields to parse:
   `cin` (as `id`), `name`, `status`, `companyClass`, `description`, `registeredState`, `incorporationYear` (numeric), `paidUpCapitalCr` (numeric), `operatingRevenueRange` (categorical), `ebitdaChangePct`, and `directors` (flattened array of designations/names).
3. Normalize on import: trim; canonical casing for `registeredState` and `status`; numbers as numbers; empty/missing → `null`.
4. **Embeddings Generation:** During the import script (`scripts/import-companies.ts`), concatenate the rich text columns into a single string. Specifically combine: `description`, `companyClass`, `registeredState`, `operatingRevenueRange`, and the names/designations from the `directors` array. Call the Voyage AI API (`voyage-4-lite`) to generate a vector embedding of this string. Store the resulting array as `embedding` on the document.
5. Define `QUERYABLE_FIELDS`: the list of fields (e.g., `companyClass`, `registeredState`, `paidUpCapitalCr`), their type, and allowed operators. Tool schemas are generated from this list.
6. Indexes: on each categorical/numeric field used in filters, plus a **MongoDB Vector Search index** over the `embedding` array.
7. `scripts/build-vocabulary.ts` generates `agent/skills/company-vocabulary.md` (e.g., valid states, revenue bands).
8. Data Strategy & Progressive Enrichment (Hybrid Approach)

- **Primary Tier (Static/Vector Search):** The app boots and serves core chat queries using the local pre-seeded MongoDB collection imported from the Kaggle CSV (`data/indian_companies.csv`). This handles 90% of user queries instantly via MongoDB Vector Search + Voyage AI (`voyage-4-lite`).
- **Secondary Tier (On-Demand Apify Enrichment / Post-MVP):** If a user requests live, highly specific deep-dives or if a company is missing from the baseline CSV dataset, the agent can optionally leverage an Apify tool call (e.g., fetching live data by CIN via `foxlabs/indian-company-data`) as an after-thought/fallback mechanism.

## 3. Tool contracts (the only three business tools)

All inputs validated with Zod. All outputs are plain JSON, deterministic, and read-only.

**Implemented Phase 2 contract:** The user-approved CSV adaptation, scoring algorithm, limits and test matrix are in [phase-2-contract.md](phase-2-contract.md). Use that contract and `lib/companies/schema.ts` for implementation; the original Apify-oriented example below is historical.

### 3.1 `search_companies`

```ts
input: {
  filters: {
    // Hard constraints matching the Apify Indian Company Data schema
    statuses?: string[];              // e.g., ["Active"]
    companyClasses?: string[];        // e.g., ["private", "public"]
    registeredStates?: string[];      // e.g., ["Maharashtra", "Karnataka"]
    incorporationYear?: { min?: number; max?: number };
    paidUpCapitalCr?: { min?: number; max?: number }; // in ₹ Cr
    operatingRevenueRanges?: string[];
  };
  semanticQuery?: string;           // Text to be embedded via voyage-4-lite for Vector Search
  limit?: number;                   // default 50, max 100
}
output: {
  total: number;
  returned: number;
  companies: Array<{ cin: string; name: string; registeredState: string; paidUpCapitalCr: number }>;
  appliedFilters: object;
  unrecognized?: Array<{ field: string; value: string; didYouMean?: string[] }>;
  relaxationHints?: Array<{ removed: string; wouldReturn: number }>;
}

```

## 4. Custom MCP Server Implementation

The three core business functions are exposed via a custom HTTP MCP Server built inside the Next.js app (`app/mcp/route.ts`):

1. **`search_companies`**
   - **Input:** `{ filters?: object, semanticQuery?: string, limit?: number }`
   - **Execution:** Generates vector embeddings for `semanticQuery` using `voyage-4-lite`, applies hard filter constraints, and queries MongoDB via `$vectorSearch`.
   - **Output:** Returns candidate summary records and total match counts.

2. **`score_companies`**
   - **Input:** `{ companyIds: string[], criteria: Array<{ field, op, value, weight, required }>, topN?: number }`
   - **Execution:** Pure TypeScript deterministic scoring engine (`lib/companies/score.ts`). Zero LLM involvement in score computation.
   - **Output:** Top N ranked companies (default 10) with detailed match breakdowns (`match`, `partial`, `miss`, `unknown`).

3. **`get_company`**
   - **Input:** `{ companyId: string }`
   - **Execution:** Calls `lib/companies/details.ts` to retrieve the full un-truncated record from MongoDB. Strips internal fields (`_id`, `embedding`).
   - **Output:** Complete company profile for Generative UI rendering in chat.

### Security & Connection

- **Authentication:** Protected by `Authorization: Bearer ${MCP_API_KEY}`.
- **Agent Integration:** Connected to the glm-5.3-flash agent via `agent/connections/companies.ts` using `defineMcpClientConnection`.
