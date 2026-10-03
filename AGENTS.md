# Company Finder — Agent Instructions

Read this file first, every session. Then read only the docs your phase names.

> This project REPLACES the earlier "LeadLens prospect-intelligence" docs. If they exist in the repo, move them to `docs/legacy/` and ignore them. Nothing in them applies.

## What we are building

A ChatGPT-style chat app where a user describes the kind of companies they want in plain language, and an AI agent finds, scores and explains the best matches from a fixed database of ~1,000 predefined companies.

Example: "B2B SaaS companies in Germany looking for VP Sales with 50–200 employees" → the agent extracts hard filters and a semantic query, searches the DB using Vector Search, scores the candidates, and shows the **top 10** with scores.

## Hard Rules for MCP Tools

1. **Strictly 3 Business Tools:** Only `search_companies`, `score_companies`, and `get_company` exist on the MCP server. No 4th tool may be added.
2. **MCP Host Location:** Hosted in `app/mcp/route.ts` using Vercel's MCP route adapter / TypeScript MCP SDK.
3. **Execution Safety:** Tools are strictly read-only at runtime. They read from MongoDB Atlas and generate query embeddings via Voyage AI; they never perform write operations.
4. **LLM Boundary:** glm-5.3-flash decides _when_ and _with what arguments_ to invoke the MCP tools, but score calculations and DB search logic remain isolated inside the custom MCP handlers.

## Architecture

```text
assistant-ui (React chat UI, Next.js)
        ↓  eve HTTP channel (streaming, durable sessions)
eve agent  (agent/instructions.md, agent/agent.ts, glm-5.3-flash model)
        ↓  calls exactly 3 business tools
  search_companies  → calls Voyage AI for embeddings → filters DB via MongoDB Vector Search
  score_companies   → score vs the user's request, rank, top N (deterministic)
  get_company       → full details for one company id
        ↓
shared core library  lib/companies/*   (pure logic + DB access, tested)
        ↓
MongoDB Atlas  (collection: companies, Vector Search index, read-only at runtime)


<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
```
