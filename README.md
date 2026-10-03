# CorpScout

CorpScout is a ChatGPT-style conversational agent that allows users to search, filter, and score a fixed database of companies using natural language. It uses **GLM-5.3** as the core reasoning engine and **voyage-4-lite** to generate dense text embeddings for semantic MongoDB vector search. 

When a user submits a query, the agent parses hard constraints (e.g., employee count, exact country) and conceptual requirements (e.g., "fast-growing AI startups"). The app runs a hybrid Vector + Filter search, deterministically scores the candidates against the user's criteria, and streams back ranked results using a rich Generative UI.

## Architecture

```text
assistant-ui (React chat UI, Next.js)
        ↓  eve HTTP channel (streaming, durable sessions)
eve agent  (agent/instructions.md, agent/agent.ts, GLM-5.3 model)
        ↓  calls exactly 3 business tools via MCP Connection
  search_companies  → voyage-4-lite embeddings → MongoDB Vector Search
  score_companies   → pure deterministic scoring (0-100)
  get_company       → fetch full company details
        ↓
shared core library  lib/companies/*   (pure logic + DB access, tested)
        ↓
MongoDB Atlas  (collection: companies, Vector Search index)