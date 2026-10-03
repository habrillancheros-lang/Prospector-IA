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

Both URIs can connect to the same Atlas cluster and database. You only need a
separate MongoDB user with chat-write permissions; reuse an existing suitably
restricted user if you have one. Leave `MONGODB_CHAT_DB` unset when `companies`,
`chats` and `chat_events` share the database named by `MONGODB_DB`.

The app proxies Eve through `/api/chat` and archives stream events on the server,
including during browser disconnects (within the host's request duration).
MongoDB stores transcripts; Eve still owns live agent state and continuation.
Preserve Eve's workflow storage across restarts/deployments to continue old
sessions. An expired or retired Eve session remains visible in history but
cannot accept further messages.

## Local setup

Use Node.js 24 or newer (`nvm use` selects the pinned local version), then run:

```bash
npm ci
cp .env.example .env.local
```

Fill `.env.local` with the provider keys, Atlas database and credentials, and a
random `MCP_API_KEY`. Keep `MCP_SERVER_URL=http://localhost:3000/mcp` for
development. Run `npm run dev` and open `http://localhost:3000`.

The database must already contain the normalized company records and the
Vector Search index from `scripts/import-companies.ts`. Importing is an offline
setup operation using `MONGODB_IMPORT_URI`; runtime company tools are read-only.

```bash
npm run test:core
npm run test:chats
npm run test:evals
npm run test:deployment
npm run lint
npx tsc --noEmit
npm run build
```

`npm run build` uses webpack. `npm run build:eve` separately compiles the Eve
runtime; a frontend build alone does not verify the durable agent. Vercel's
generated Eve service builds that runtime automatically.

## First Vercel deployment

1. Create a Vercel account, connect the Git provider containing this repository,
   and import the repository as a Next.js project. Keep the project root at the
   repository root and select Node.js 24.x in project settings.
2. Before deploying, add the environment variables below to the **Production**
   environment. Use server-side variables with their exact names; these values
   must never use a `NEXT_PUBLIC_` prefix. The project name determines the default
   production hostname. Set `MCP_SERVER_URL` to
   `https://<your-project-hostname>/mcp` and confirm the assigned domain after
   deployment. A custom domain also works if it routes to this project.
3. Configure Atlas network access to allow the deployed runtime. Use a company
   credential with read-only access and a separate chat credential with
   `find`, `insert`, `update`, `remove`, and `createIndex` permissions on `chats`
   and `chat_events`. Have those collections provisioned before deploying if
   the chat credential cannot create collections. Verify the company Vector
   Search index is ready.
4. Deploy. The committed `vercel.json` runs `npm run deploy:build`, which checks
   the environment before the frontend build. `withEve` generates the additional
   Eve service and routes; its build also checks the environment. Confirm Vercel
   can provision the Eve service and Workflow runtime for your account.
5. Allow public access to the production demo in Vercel Deployment Protection
   settings. Verify both the browser and the agent can reach the production
   domain. The Eve channel explicitly admits reviewers without a password;
   `/mcp` still requires its server-side bearer credential.

| Variable           | Production value                                         |
| ------------------ | -------------------------------------------------------- |
| `GLM_API_KEY`      | Standard Z.ai API key for glm-5.3-flash                  |
| `VOYAGE_API_KEY`   | Voyage AI API key                                        |
| `MONGODB_URI`      | Read-only company database credential                    |
| `MONGODB_DB`       | Database containing `companies`                          |
| `MONGODB_CHAT_URI` | Dedicated chat read/write and index credential; required |
| `MONGODB_CHAT_DB`  | Optional; defaults to `MONGODB_DB`                       |
| `MCP_API_KEY`      | A random shared secret used by both the agent and `/mcp` |
| `MCP_SERVER_URL`   | Public HTTPS production endpoint ending in `/mcp`        |

Do not upload `.env.local` or the offline `MONGODB_IMPORT_URI` to Vercel.
Configure the same required variables for Preview if you enable preview builds;
its MCP endpoint must use the same matching bearer credential.

To check a prospective production environment locally, supply these variables
in your shell and run `npm run deploy:check`. To inspect the current local file,
run `node --env-file=.env.local scripts/check-deployment.ts`; the development
localhost endpoint intentionally fails the production check. The check prints
only missing variable names and configuration errors. It does not verify
credential permissions, provider credit, Atlas connectivity or hosted services.

## Verify before sharing

Open the production URL in a fresh browser without a Vercel login. Confirm:

- The page and `GET /eve/v1/health` load; health reports `status: "ready"`.
- A search such as "Private software companies in Bangalore" returns a scored,
  ranked top 10 when enough matches exist.
- A follow-up such as "Only companies with 51–200 employees" refines the results.
- Company details load, and CSV export contains the displayed ranked results.
- Reload preserves the conversation and results; a saved chat accepts a new message.
- A second fresh browser has its own chat history.
- An unauthenticated `/mcp` request returns 401.

The existing `scripts/try-mcp.ts` can verify the three tools against a hosted
`MCP_SERVER_URL` using the matching `MCP_API_KEY`. A successful health response
or build alone does not prove model calls, chat persistence or Workflow resume.
The demo URL can be added here after this deployed smoke test passes.

## Dataset limits

This prototype searches a fixed Indian company dataset of approximately 1,000
records. It does not fetch live registry data, current hiring signals or new
companies. Employee counts are source bands, and missing or ambiguous data is
reported as unknown. Scores measure the supported request criteria; they are
not a probability of purchase or a guarantee that source data is current.
