# Prototype deployment readiness report

Date: 2026-10-04

Status: local deployment preparation is complete. Production credentials, a
Vercel account/project, and the deployed browser smoke test remain. The user
requested local preparation first and has not created a Vercel account yet.

## Requirements addressed in order

1. **Production browser access to Eve — implemented and locally verified.**
   `agent/channels/eve.ts` replaces the default placeholder policy with
   `[vercelOidc(), localDev(), none()]`. Reviewers can use the demo without a
   password or access-code screen. The separate MCP bearer protection and exactly
   three read-only business tools remain in place. A built production Eve
   runtime accepted anonymous health and info requests; an anonymous session
   request with a missing message reached input validation (400 instead of 401).
2. **Production chat database credential — preparation complete; credential pending.**
   The deployment check requires `MONGODB_CHAT_URI` and rejects reusing the exact
   company connection string. The existing production code continues to disable
   the import-credential fallback. `.env.example` and the README document the
   dedicated chat credential and required collection permissions. No credential
   was created, copied from the importer or changed locally. The user must
   configure this credential in Atlas and Vercel.
   The chat and company collections can share the same cluster and database:
   `MONGODB_CHAT_DB` is optional and defaults to `MONGODB_DB`. The separate URI
   supplies different user permissions; it does not require a new database.
3. **Hosted environment and MCP endpoint — configuration implemented; hosting pending.**
   `scripts/check-deployment.ts` validates the required provider keys, company
   database, chat credential, MCP secret, Node 24+ and hosted endpoint without
   printing secrets. Production MCP configuration requires HTTPS and the `/mcp`
   path, rejecting localhost, malformed URLs and credentials/query parameters in
   the URL. `vercel.json` runs `npm run deploy:build`; both the frontend and the
   generated Eve service run the environment check before building. The Next.js
   build now uses the verified webpack command. The user still needs to add the
   real environment values, permit Atlas connectivity and enable public demo
   access in Vercel.
4. **Production build and full browser flow — local checks complete; deployed test pending.**
   The Next.js frontend and separate Eve runtime both compile. Vercel output
   generation includes Eve's service, its checked build command and public
   transport routes. No deployment was started. The README contains the fresh
   browser checklist for search, ranked top 10, refinement, details, CSV export,
   reload and saved-chat continuation. These must be tested on the actual host
   with its Workflow runtime before sharing the demo.

## Verification

| Check                                                     | Result                                                                                                  |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `npm run test:core`                                       | 21 passed                                                                                               |
| `npm run test:chats`                                      | 8 passed                                                                                                |
| `npm run test:evals`                                      | 4 passed; local grounding-checker tests, not live model evaluations                                     |
| `npm run test:deployment`                                 | 4 passed; required configuration, credential separation, endpoint rejection and secret-free diagnostics |
| `npm run lint`                                            | Passed                                                                                                  |
| `./node_modules/.bin/tsc --noEmit`                        | Passed                                                                                                  |
| `npm run build`                                           | Passed using webpack: compilation, TypeScript, page generation and build traces                         |
| `npm run build:eve`                                       | Passed with a temporary placeholder HTTPS MCP URL supplied for compilation                              |
| Built Eve runtime in production mode                      | Anonymous health and info returned 200; missing-message session request returned 400                    |
| Vercel output generation                                  | Passed: Eve service, environment-checked service build and `/eve/v1` routes present                     |
| Production environment check against current `.env.local` | Correctly fails: `MONGODB_CHAT_URI` missing; MCP endpoint still points at localhost                     |
| `git diff --check`                                        | Passed                                                                                                  |

The production runtime smoke test used isolated temporary workflow storage,
without operator credentials, model calls or database calls. The placeholder
MCP URL used for compilation and this smoke test is not a configured deployment.
An initial sandboxed runtime attempt encountered local transport failures;
the isolated smoke test passed outside the sandbox.

The previous readiness review found that default Turbopack builds failed while
starting a CSS worker (`Operation not permitted`), including outside the
sandbox. The default build is now webpack; Turbopack was not retested.

No secrets were printed or added to source. Local `.env.local` values were not
modified. The existing Phase 4 report remains the evidence for live model
evaluation; no live model suite was rerun here.

## User setup still required

Follow [First Vercel deployment](../README.md#first-vercel-deployment) in order:

1. Create a Vercel account and import the repository as a Next.js project with
   Node 24.x.
2. Create the dedicated Atlas chat credential and add the required production
   environment variables. Keep the company runtime credential read-only and
   the offline import credential out of the deployment.
3. Set `MCP_SERVER_URL` to the assigned public production hostname plus `/mcp`;
   allow Atlas access and provision Eve's service and Workflow runtime.
4. Deploy, permit reviewer access through deployment protection, and complete
   the README's fresh-browser smoke test before adding/sharing the demo URL.

Vercel file-based build configuration and Node runtime settings were checked
against the official [project configuration](https://vercel.com/docs/project-configuration)
and [Node.js versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)
documentation. Eve integration and anonymous-access behavior were checked
against the installed Eve 0.56.0 documentation and built runtime.

## Scope and limits

Hosted credentials, Atlas connectivity and permissions, provider balances,
Vercel service availability and the complete deployed user flow remain
unverified. The environment check validates configuration only. MongoDB
transcripts alone do not run or resume the agent; hosted Eve Workflow must work.

Additional card styling, user accounts, access codes, Apify enrichment,
dashboards and broader evaluations are not required for the internship
prototype. The README now includes setup instructions and dataset limitations.
