# Prototype deployment readiness report

Date: 2026-10-04

Status: application checks pass; deployment configuration and a deployed smoke test remain. No additional full product phase is necessary for the internship prototype.

The user wants reviewers to open the demo and test it without a shared access code. No access-code, login, or authentication implementation was added. Existing Phase 4 changes were preserved. This review adds only this report.

## Required before sharing the demo

1. **Configure production browser access to Eve.** There is no authored `agent/channels/eve.ts`. The installed Eve 0.56.0 default uses `vercelOidc()`, `localDev()`, and `placeholderAuth()`. That permits local development and trusted Vercel callers but rejects an ordinary unauthenticated production browser. The demo needs an explicit channel policy that admits reviewers without a password. This is separate from MCP bearer authentication and does not require an access-code screen. References: `node_modules/eve/docs/channels/eve.mdx`, `node_modules/eve/dist/src/framework/sources/modules/eve-channel.js`.
2. **Configure the production chat database credential.** Local `.env.local` has no `MONGODB_CHAT_URI`; development currently falls back to `MONGODB_IMPORT_URI`. `lib/chats/db.ts` disables this fallback in production. Set `MONGODB_CHAT_URI` in the deployment to a credential with read/write and index permissions for `chats` and `chat_events`. `MONGODB_CHAT_DB` may be omitted when those collections use `MONGODB_DB`. Keep the company database runtime credential read-only.
3. **Configure the hosted environment and MCP endpoint.** Set `GLM_API_KEY`, `VOYAGE_API_KEY`, `MONGODB_URI`, `MONGODB_DB`, `MONGODB_CHAT_URI`, and `MCP_API_KEY` in Vercel. Set `MCP_SERVER_URL` to the actual hosted `/mcp` endpoint; the local value points to localhost. Use Node 24 or newer. Verify Atlas connectivity and that any deployment-level protection allows reviewers and the agent's requests to `/mcp`.
4. **Verify a deployed build and the complete browser flow.** Test a search, ranked top 10, refinement, company details, CSV export, reload and saved-chat continuation. Check from a fresh browser without operator credentials. Confirm the hosted Eve service and durable workflow runtime are available; MongoDB transcripts alone do not run or resume the agent.

## Checks performed

| Check                              | Result                                                                                                                                                       |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run test:core`                | 21 passed                                                                                                                                                    |
| `npm run test:chats`               | 3 passed                                                                                                                                                     |
| `npm run test:evals`               | 4 passed; these are local grounding-checker tests, not live model evaluations                                                                                |
| `npm run lint`                     | Passed                                                                                                                                                       |
| `./node_modules/.bin/tsc --noEmit` | Passed                                                                                                                                                       |
| `npm run build`                    | Turbopack failed while starting a CSS worker: binding a local port returned `Operation not permitted`. Retrying outside the sandbox produced the same error. |
| `npm run build -- --webpack`       | Passed: compilation, TypeScript, page generation and build traces completed                                                                                  |
| Tracked environment files          | Only `.env.example` is tracked; this was not a complete git-history secret audit                                                                             |

The webpack check confirms the Next.js application compiles for production. It does not prove the default Turbopack command will pass on the deployment host or that the hosted Eve service works. If the hosted default build fails similarly, the verified webpack command is an available build configuration option.

No secrets were printed. Environment inspection recorded only presence or absence and whether the MCP URL points at localhost. The existing Phase 4 report remains the evidence for live model evaluation; no live model suite was rerun here.

## Work that can wait

Additional result-card styling, user accounts, shared access codes, Apify enrichment, dashboards and broader evaluation expansion are not required to demonstrate the existing prototype. A short README update with setup instructions, the demo URL and dataset limitations is useful for the assignment handoff.

## Scope and limits

No application code or environment values were changed, and no deployment was started. Atlas connectivity, hosted credentials, Vercel service provisioning and production browser behavior remain unverified. The three business tools and the existing MCP bearer protection remain unchanged.
