# CorpScout

CorpScout is a ChatGPT-style conversational agent that allows users to search, filter, and score a fixed database of companies using natural language. It uses **glm-5.3-flash** as the core reasoning engine and **voyage-4-lite** to generate dense text embeddings for semantic MongoDB vector search.

When a user submits a query, the agent parses hard constraints (e.g., employee count, exact country) and conceptual requirements (e.g., "fast-growing AI startups"). The app runs a hybrid Vector + Filter search, deterministically scores the candidates against the user's criteria, and streams back ranked results using a rich Generative UI.

## Architecture

```text
assistant-ui (React chat UI, Next.js)
        ↓  eve HTTP channel (streaming, durable sessions)
eve agent  (agent/instructions.md, agent/agent.ts, glm-5.3-flash model)
        ↓  calls exactly 3 business tools via MCP Connection
  search_companies  → voyage-4-lite embeddings → MongoDB Vector Search
  score_companies   → pure deterministic scoring (0-100)
  get_company       → fetch full company details
        ↓
shared core library  lib/companies/*   (pure logic + DB access, tested)
        ↓
MongoDB Atlas  (collection: companies, Vector Search index)
```

## Chat history

Chats and the complete Eve event stream are saved in MongoDB collections `chats`
and `chat_events`. The left sidebar lists recent conversations, opens saved
messages and company cards, and starts new chats. Older chats load in pages.
History survives reloads; an HttpOnly browser cookie identifies the owner, so
different browsers have separate histories. Clearing that cookie loses access
to its history. Cross-device history requires user authentication.

Set `MONGODB_CHAT_URI` to a credential with read/write and index permissions for
these two collections. `MONGODB_CHAT_DB` defaults to `MONGODB_DB`. Locally, an
unset chat URI falls back to `MONGODB_IMPORT_URI`; the read-only company URI is
never used for chat writes. Prefer a restricted chat credential for deployment.
The three MCP tools and their read-only behavior are unchanged.

The app proxies Eve through `/api/chat` and archives stream events on the server,
including during browser disconnects (within the host's request duration).
MongoDB stores transcripts; Eve still owns live agent state and continuation.
Preserve Eve's workflow storage across restarts/deployments to continue old
sessions. An expired or retired Eve session remains visible in history but
cannot accept further messages.
