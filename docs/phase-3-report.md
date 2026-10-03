# Phase 3 — MCP server and agent wiring

The app exposes exactly three read-only business tools at `app/mcp/route.ts`: `search_companies`, `score_companies`, and `get_company`. Each handler validates the Phase 2 schemas and delegates to the shared core. MongoDB access stays read-only; query embeddings use the existing 256-dimensional Voyage configuration.

The route uses pinned `mcp-handler@2.1.1` and `@modelcontextprotocol/server@2.0.0`. Missing or incorrect bearer credentials return 401. Token hashes are compared with `timingSafeEqual`; service errors return sanitized structured messages without credentials or stack traces.

`agent/connections/companies.ts` uses `MCP_SERVER_URL` and the app-owned `MCP_API_KEY`, with an explicit three-tool allowlist. The user approved keeping `glm-5.3-flash`. Default optional tools are disabled; the framework `load_skill` tool remains available for the company vocabulary. It is not registered on the business MCP server. No template weather tool existed to remove.

The agent instructions cover vocabulary loading, hard filters, semantic queries, deterministic ranking, stable IDs for details, missing fields, zero results and consent before relaxing requirements. There is no duplicated native-tool fallback. Live discovery and authentication work locally. The supplied spec does not contain the referenced fallback section 4.5 or sections 5 and 7; Phase 4 will add the broader quality evaluation suite.

## Verification

- `npm run mcp:try`: standalone initialization, bearer rejection, exact tool inventory, bad-input rejection, semantic search, deterministic top 10, found details and missing-ID handling passed.
- Browser: private software-services search completed search → score → ranked answer; a follow-up for `indian-csv:1003` displayed GirnarSoft's database profile.
- Eve terminal UI: public banking/financial-services search completed discovery → search → score → ranked answer.
- `npm run agent:try` exercises three additional searches and detail follow-ups against the real local agent. It asserts tool discovery and order; it is a smoke check, not the Phase 4 text/argument evaluation suite.
- All 18 core/security tests and TypeScript checking passed.
- Repository-wide lint and formatting passed after adding `.oxfmtrc.json` and formatting existing files. The config uses the formatter defaults and removes its repeated missing-config notice.

An earlier durable session retained the invalid model ID `glm-5.3-flash-flash`. A fresh session used the corrected configuration and succeeded. Create a fresh chat after changing agent configuration when diagnosing stale sessions.

Run these commands from the repository root with Node 24 or newer and the ignored `.env.local` configured:

```sh
npm run dev
npm run mcp:try
npm run agent:try
npm run test:core
npm run lint
```

The checks cover localhost development. Vercel preview deployment and production authentication/session ownership have not been validated. Apify enrichment and the later UI phases are outside this phase.

## Name-only details checks

Fresh chat requests containing names without IDs were tested against the live agent:

| Requested name              | Observed result                                                                    |
| --------------------------- | ---------------------------------------------------------------------------------- |
| GirnarSoft                  | Name search, then details for `indian-csv:1003`                                    |
| Trigent Software            | Name search, then details for `indian-csv:2221`                                    |
| Tudip Technologies          | Two matching IDs; asks the user to choose and does not fetch details yet           |
| NonexistentCompanyZXQ987654 | No matches; explains the dataset limit without inventing an ID or fetching details |

The initial duplicate-name run fetched both records. Instructions were corrected to stop and ask for a selection even when the records look identical. A fresh-session retest of the duplicate and missing-name cases passed. The two unique-name cases passed before that correction. No Apify connection or fourth business tool was added.

`npm run agent:try-names` repeats all four smoke checks. The script also checks expected IDs for unique names, search-before-details order, and that details requests do not invoke scoring. TypeScript and repository lint/format checks pass.
