# Phase 0 — platform findings

Current update: Phase 3 now adds the authenticated `/mcp` route and the eve companies connection using pinned `mcp-handler@2.1.1` and `@modelcontextprotocol/server@2.0.0`. The user approved `glm-5.3-flash`. Local MCP discovery, all three business tools, browser and terminal search/ranking work; see `phase-3-report.md`. Repository formatting housekeeping is resolved with `.oxfmtrc.json`; the earlier findings below retain their historical context.

Verified 2026-10-03 against installed eve 0.56.0 and the current assistant-ui documentation. Phase 0 acceptance is met: the app runs with isolated Node 24.21.0, both credentials are populated locally, and glm-5.3-flash reply streaming is verified in the browser and terminal UI. Historical failures and their resolutions are retained below. No company product logic or MCP tools have been implemented.

## a. Scaffold, layout, and versions

`create-assistant-ui@0.0.82` was resolved by `npx create-assistant-ui@latest`. The `eve` template rejected the non-empty current repo. It was generated at `/private/tmp/company-finder-phase0` with `--no-skills`, then copied into this repo. Existing AGENTS.md, README.md, docs, Git history and ignore rules were preserved; the generated README is saved as `docs/00-template-readme.md`. No additional coding-agent skills were installed.

The CLI selected npm and installed registry thread/UI components after the initial dependency install. Direct dependency versions now have exact pins in package.json; package-lock.json pins transitive packages. `packageManager` is `npm@10.9.2`. Initial installation warned about two vulnerabilities (one moderate, one high); no forced upgrades were applied.

| Component                    | Installed version                                     |
| ---------------------------- | ----------------------------------------------------- |
| Node on machine              | 23.6.1 (unsupported by eve)                           |
| Required Node                | >=24 (package.json and node_modules/eve/package.json) |
| npm                          | 10.9.2                                                |
| eve                          | 0.56.0                                                |
| Next.js                      | 16.3.8                                                |
| React / React DOM            | 19.3.0                                                |
| @assistant-ui/react          | 0.15.23                                               |
| @assistant-ui/eve            | 0.0.20                                                |
| @assistant-ui/next           | 0.0.23                                                |
| @assistant-ui/react-markdown | 0.14.18                                               |
| TypeScript                   | 7.0.2                                                 |

Root template files: `.env.example`, `.gitignore`, `README.md`, `components.json`, `next.config.ts`, `package.json`, `package-lock.json`, `postcss.config.mjs`, `tsconfig.json`. The generated source inventory is:

```text
agent/agent.ts
agent/instructions.md
app/globals.css
app/layout.tsx
app/page.tsx
components/assistant-ui/elements/attachment.aui.tsx
components/assistant-ui/elements/file.tsx
components/assistant-ui/elements/follow-up-suggestions.aui.tsx
components/assistant-ui/elements/image.tsx
components/assistant-ui/elements/markdown-text.tsx
components/assistant-ui/elements/media-player.tsx
components/assistant-ui/elements/reasoning.aui.tsx
components/assistant-ui/elements/reasoning.tsx
components/assistant-ui/elements/surfaces.tsx
components/assistant-ui/elements/thread.aui.tsx
components/assistant-ui/elements/tool-fallback.aui.tsx
components/assistant-ui/elements/tool-group.aui.tsx
components/assistant-ui/elements/tooltip-icon-button.tsx
components/assistant-ui/utils/href.ts
components/eve-authorization.tsx
components/ui/avatar.tsx
components/ui/button.tsx
components/ui/collapsible.tsx
components/ui/dialog.tsx
components/ui/skeleton.tsx
components/ui/textarea.tsx
components/ui/tooltip.tsx
hooks/use-attachment-src.ts
hooks/use-copy-to-clipboard.ts
lib/utils.ts
```

There is no authored `agent/tools/`, `agent/skills/`, `agent/connections/`, `agent/channels/`, or `app/mcp/route.ts` in this template. In particular, it contains no example business tool to remove. Template instructions, UI examples and authorization renderer are preserved. The source entry uses a bare `useEveAgentRuntime()` and `AssistantRuntimeProvider`; `next.config.ts` composes `withEve(withAui(nextConfig))`.

## b. Agent, tools, skills and connections

Bundled references (paths relative to `node_modules/eve/docs/`): `agent-config.md`, `tools/overview.mdx`, `instructions.mdx`, `skills.mdx`, `connections/overview.mdx`, `reference/typescript-api.md`.

- `agent/agent.ts` default-exports `defineAgent({...})` from `eve`. An authored config requires `model`. A string is an AI Gateway ID; a provider-authored AI SDK `LanguageModel` calls a provider directly. The template selects `anthropic/claude-sonnet-5`, using AI Gateway credentials from `.env.example`.
- `agent/instructions.md` is the system prompt. TypeScript composition uses `defineInstructions` from `eve/instructions`, with `content` and optional `role`. Root markdown and root TypeScript instructions cannot coexist; an instructions directory can supplement either.
- A tool lives at `agent/tools/<name>.ts`, default-exporting `defineTool` from `eve/tools`. Its filename names the tool. Fields: `description`, required `inputSchema`, `execute(input, ctx)`; optional `outputSchema`, activity labels, approval policy and `toModelOutput`. Schemas can be Zod, Standard Schema, or JSON Schema. Authored executors run in app runtime with environment access, not a sandbox.
- Skills live under `agent/skills/`: flat `.md`, packaged `<name>/SKILL.md` with description frontmatter, or `.ts` with `defineSkill` from `eve/skills` (`description`, `markdown`, optional `files`). The model sees descriptions and calls `load_skill` for content. Flat markdown without description uses its first suitable text line. Static skills require no sandbox; package file access and dynamic skills require one.
- Connections are file-based under `agent/connections/`; static filenames determine their runtime names. Definitions are compiled, and credentials are resolved at runtime. Dynamic definitions are available when later needed.

## c. MCP client auth, filters, discovery and naming

References: `connections/mcp.mdx`, `connections/overview.mdx` (Static-token auth, Headers, Per-caller auth and headers), `concepts/built-in-tools.md` (connection_search).

Import `defineMcpClientConnection` from `eve/connections`. Default-export a definition with `url` and a model-facing `description`. Streamable HTTP and SSE endpoints are supported. Protocol discovery is enabled by default; `protocolVersionDiscovery: false` starts the legacy initialize handshake instead (proposes 2025-11-25). Compatibility must be checked against the eventual MCP server rather than assumed.

`auth: { credentialOwner: "app", getToken: async () => ({ token: process.env.MCP_API_KEY! }) }` supplies shared bearer auth. `getToken` returns `{ token, expiresAt? }`; eve sends Authorization Bearer. App ownership is the getToken-only default. User-owned credentials require an authenticated user principal. Headers accept a map or runtime resolver; they supplement auth and support other schemes. Vercel Connect uses `connect` from `@vercel/connect/eve`; user scope is its default, with explicit app scope available. No auth is appropriate only for intentionally public or loopback services.

Use exactly one of `tools.allow` and `tools.block`, matching bare remote tool names. For the future companies connection, allow exactly `search_companies`, `score_companies`, `get_company`. This does not add a business tool to the MCP server.

The model discovers remote schemas using the built-in `connection_search`, which remains available when connections exist even with `defaultTools: false`. It calls discovered tools by `<connection>__<tool>`; `agent/connections/companies.ts` therefore yields `companies__search_companies`, `companies__score_companies`, `companies__get_company`. Descriptions drive discovery. URLs and credentials are not exposed to the model. UI renderers must match these qualified names. Connection approval policies also receive qualified names.

## d. Channel routes and security

References: `channels/eve.mdx`, `guides/auth-and-route-protection.md`, `guides/frontend/nextjs.mdx`, `concepts/built-in-tools.md`.

`withEve` mounts the unnamed agent's `/eve/v1/*` routes and manages its development service; there is no manually authored Next.js chat route in the template. `GET /eve/v1/health` is public. Inspection `/info` and session operations require the selected channel auth policy. The default source uses `[vercelOidc(), localDev(), placeholderAuth()]`. Local development is allowed; Vercel OIDC admits trusted infrastructure/CLI traffic; placeholder auth denies otherwise unauthenticated production calls. Production browser users need app auth. CORS is untouched by default; this template uses same-origin routes.

Default operations include creating sessions, messaging, cancel/clear/compact/reset, and NDJSON event streaming. Session creation returns 202 and a durable session ID, not a completed reply. Follow-ups steer active turns by default. Route authentication does not enforce per-user session ownership; application authorization is still required when multiple users can reach the routes.

An authored `agent/channels/eve.ts` replaces the default source. `eveChannel({...})` retains the standard routes with custom policy; `disableRoute()` removes that surface. The default channel is distinct from the custom Company Finder MCP server.

The agent also has framework defaults, including optional tools. `defaultTools: false` disables optional defaults, while connection discovery remains when connections exist. No such policy change was made in Phase 0. The hard rule of three business tools applies to the custom MCP server; the framework discovery tool is a separate agent capability.

## e. Tool rendering and custom generative UI

Official entry point read: [assistant-ui llms.txt](https://www.assistant-ui.com/llms.txt). References: [Tool Rendering](https://www.assistant-ui.com/docs/api-reference/tools/rendering), [eve integration](https://www.assistant-ui.com/docs/api-reference/integrations/eve), plus installed template `components/assistant-ui/elements/thread.aui.tsx` and `tool-fallback.aui.tsx`.

The eve runtime translates events into assistant-ui message parts. The generated thread uses a registered part UI when available, otherwise ToolFallback. ToolFallback shows execution status, expandable arguments/results, errors and approval controls; results are not automatically Company Finder cards.

Current documentation recommends a matching toolkit entry with `render`/`renderText` or per-message `MessagePrimitive.Parts` tool overrides. `makeAssistantToolUI({ toolName, render, display })` and `useAssistantToolUI` are still documented but deprecated. A display renderer does not expose another executable tool. Rendering the three server-tool outputs with qualified names preserves the business-tool boundary; no separate present/UI business tool is necessary. `components/eve-authorization.tsx` demonstrates `makeAssistantDataUI` for named authorization data, not a company/tool renderer.

## f. Hosting the future MCP route

Reference: [Vercel Deploy MCP servers](https://vercel.com/docs/mcp/deploy-mcp-servers-to-vercel), updated 2026-09-18.

Current guidance uses `mcp-handler@2.1.1`, `@modelcontextprotocol/server@2`, and Zod 4, with `createMcpHandler`, `server.registerTool`, and GET/POST route exports. Its example lives at `app/api/mcp/route.ts`; the framework determines the endpoint. Our project hard rule takes precedence: use **`app/mcp/route.ts`**, so the endpoint is `/mcp`. Version 2 uses `@modelcontextprotocol/server` instead of the older `@modelcontextprotocol/sdk`, and removes legacy SSE/Redis configuration. Select compatible exact versions at the MCP phase after approval; none of these packages was added for a server in Phase 0.

Authentication must enforce the specified MCP_API_KEY bearer token. The documented `withMcpAuth` wrapper can require a token and call an application verifier. Expose exactly the three agreed business tools, backed by shared read-only company logic. Do not use eve's separate MCP channel to silently expand this custom surface.

## g. Deviations and decisions needed

The task named `docs/01-spec.md`, but this repo contains `docs/01-specs.md`; that file was read after the user said continue. AGENTS.md has no Stack section or additional explicit stop-and-ask triggers. `docs/02-playbook.md` was not intentionally read for Phase 0.

| Difference                                                                | Implication / status                                                                   |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Current Node 23 versus template/eve >=24                                  | Resolved with approved isolated Node 24.21.0 and .nvmrc pin.                           |
| Claude/AI Gateway default versus GLM_API_KEY                              | Resolved with approved pinned OpenAI-compatible provider and direct GLM configuration. |
| No example business tool                                                  | Preserved every generated example; no tool was removed or invented.                    |
| MCP adapter documentation now uses SDK v2 server package                  | Record for later MCP phase; retain required app/mcp/route.ts path.                     |
| Remote tool names are connection-qualified                                | Future UI and instructions must use companies__ names and connection_search discovery. |
| Current assistant-ui tool renderer registration deprecates legacy helpers | Use current toolkit/part override APIs for later cards.                                |
| Production channel is fail-closed, with no session ownership ACL          | Requires explicit app-auth and ownership decisions in the appropriate phase.           |

The spec's MongoDB/Voyage pipeline remains a later-phase design and has not been tested or implemented. The actual predefined dataset is Indian-company Apify data in the spec, whereas AGENTS.md gives a German SaaS example; dataset/product coverage should be reconciled in its own phase.

GLM references: [Z.ai glm-5.3-flash](https://docs.z.ai/guides/llm/glm-5.3-flash), [AI SDK OpenAI-compatible providers](https://ai-sdk.dev/providers/openai-compatible-providers). Z.ai documents model ID `glm-5.3-flash`, reasoning always enabled, and both standard and Coding Plan Chat Completions examples. The account/key type determines the endpoint. Proposed direct provider: `@ai-sdk/openai-compatible`, explicitly reading GLM_API_KEY. Addition approved and installed as 3.0.62. VOYAGE_API_KEY is reserved in .env.local; no Voyage requests belong to this scaffold smoke test.

## Initial validation (before approved repairs and credential setup)

- `npx create-assistant-ui@latest --help`: sandbox DNS failure; succeeded with network escalation.
- `npx create-assistant-ui@latest -t eve . --no-skills`: refused non-empty directory.
- Same scaffold to `/private/tmp/company-finder-phase0`: succeeded, npm dependencies and 24 registry component files installed.
- `npm run dev`: sandbox denied binding port 3000 (EPERM). Retried outside sandbox: Next.js became ready, then eve failed with explicit Node >=24 requirement.
- `npm run lint`: oxlint passed; oxfmt reported 31 files including generated code and existing documentation. No global formatting rewrite performed.
- .env.local contains empty GLM_API_KEY and VOYAGE_API_KEY fields and is ignored by Git. Credentials must be populated locally; none have been printed.
- Browser message/streaming: not yet tested; eve cannot start on installed Node.
- Terminal UI: documented and available via `eve dev` or `eve dev --url http://localhost:3000`; not yet tested due to runtime blocker.
- Build and typecheck: pending supported runtime/model configuration.

These were the initial blockers; see final validation below for their resolution. No next-phase work started.

### Additional verification

The isolated Node 24 runtime download was approved and succeeded at `/private/tmp/company-finder-node24`. `tsc --noEmit` on the unmodified scaffold failed: generated Base UI imports in avatar/button/collapsible/dialog/tooltip require `@base-ui/react`, but the scaffold did not add that dependency. ToolFallback also reported TS7053 at line 145; reassess after restoring the missing types. Permission requested before adding the missing Base UI package. No generated code fix applied yet.

### Current validation after approved repairs

- User approved isolated Node 24 and direct GLM configuration; runtime is Node 24.21.0 (`.nvmrc` pins it). Standard Z.ai API key selected.
- User approved adding `@ai-sdk/openai-compatible@3.0.62` and the missing `@base-ui/react@1.8.0`; both are exact package.json/lockfile pins.
- `agent/agent.ts` now calls `createOpenAICompatible` with name `zai`, standard `https://api.z.ai/api/paas/v4`, and GLM_API_KEY. Model is `glm-5.3-flash`, explicit context size is 1,000,000, provider reasoning effort is low for the smoke test. Template instructions remain unchanged.
- `env PATH=/private/tmp/company-finder-node24/node_modules/node/bin:$PATH npm run dev` succeeds. Next.js on port 3000 proxies the eve development service; browser GET / returned 200. Dev server remains running.
- `tsc --noEmit` passes after Base UI installation; the ToolFallback TS7053 issue disappeared with restored primitive types.
- Next.js automatically updated tsconfig.json (allowJs, incremental, dev types include) and appended its bounded agent-rules block to AGENTS.md. Original company instructions remain intact. The appended block was read.
- macOS browser automation became available after permission setup. In Chrome at localhost:3000, sent “Say hello in one short sentence.” and observed the working state. An earlier template suggestion displayed Z.ai's missing authentication-header error. Successful reply streaming remains blocked by empty GLM_API_KEY. VOYAGE_API_KEY is also empty.
- Terminal UI connection launched with `eve dev --url http://localhost:3000` under Node 24; result to be recorded once observed.
- Template formatting issues remain; oxlint and typecheck are the successful code checks. No product code, MCP server, dataset logic, or new business tool was added.

## Final validation and Phase Report

Phase 0 acceptance met on 2026-10-03. Both GLM_API_KEY and VOYAGE_API_KEY are now set in ignored .env.local. Only presence was checked; secrets were not printed. Voyage access is not exercised until the later embedding/search work.

The dev server was restarted with Node 24.21.0 after credential entry and remains running at http://localhost:3000. Browser UI in Chrome returned a hello/counting reply and a longer explanation. The browser session's durable user stream contains **162 message.appended events, two message.completed events, and two completed turns**. Sample delta lengths were 5, 1, 2, 5, 5, 1, 7 and 5 characters. This confirms incremental text delivery, rather than only a final response. Evidence is local runtime data under `.eve/.workflow-data/streams/chunks/strm_01M411RXH0MXR6S9MXDSV45NBF_user/`; it is intentionally ignored by Git.

The terminal UI connected with `eve dev --url http://localhost:3000` under Node 24, identified eve 0.56.0 and zai/glm-5.3-flash, accepted messages, and streamed “Hello” before completing “Hello from the terminal.” Its session recorded eight text append events across two completed replies. Terminal chat works; it was exited after testing.

Commands and results:

| Command / operation                                                                            | Result                                                                                                                                                                |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scaffold CLI with eve template in temporary empty directory                                    | Passed, then copied into current repo preserving existing project files                                                                                               |
| npm install --save-exact @ai-sdk/openai-compatible                                             | Passed, version 3.0.62                                                                                                                                                |
| npm install --save-exact @base-ui/react under isolated Node 24                                 | Passed, version 1.8.0; repaired missing generated dependency                                                                                                          |
| npm install --prefix /private/tmp/company-finder-node24 --no-save --package-lock=false node@24 | Passed, Node 24.21.0                                                                                                                                                  |
| env PATH=/private/tmp/company-finder-node24/node_modules/node/bin:$PATH npm run dev            | Passed, Next.js and eve ready; browser GET / returned 200                                                                                                             |
| ./node_modules/.bin/tsc --noEmit                                                               | Passed after repair, also passed final recheck                                                                                                                        |
| ./node_modules/.bin/oxlint                                                                     | Passed, also passed final recheck                                                                                                                                     |
| npm run lint                                                                                   | Initial formatting check failed on existing/template formatting; code lint passed. Formatting remains an open housekeeping item, without affecting runtime acceptance |
| Browser UI test with GLM                                                                       | Passed; replies rendered and durable incremental stream verified                                                                                                      |
| eve dev --url http://localhost:3000                                                            | Passed; terminal replies streamed                                                                                                                                     |
| git check-ignore .env.local                                                                    | Passed                                                                                                                                                                |

Files added: full template `agent/`, `app/`, `components/`, `hooks/`, `lib/utils.ts`, components.json, next.config.ts, postcss.config.mjs, tsconfig.json, pinned package.json/package-lock.json, .env.example, .nvmrc, this findings document, and docs/00-template-readme.md. Local-only .env.local holds the supplied credentials. `.gitignore` was extended for runtime/build artifacts. Next.js automatically appended its standard agent-rules block to AGENTS.md and adjusted tsconfig.json; original company hard rules are intact.

Deviations: temporary generation because the CLI rejects a non-empty repo; the actual spec filename is plural; no Stack section or example tool exists; approved isolated Node runtime, GLM provider and missing Base UI dependency were needed. All observed platform differences are documented above. No company product code, server tools, DB access, or Phase 1 work was added.

Open questions: none blocking Phase 0. Later-phase decisions remain app authentication/session ownership and MCP SDK version compatibility. Production build/deployment was not requested or validated; runtime acceptance covers the development app. The full formatting command still reports the template/existing formatting noted above.

## Phase 2 specification gaps and approved resolution

The supplied spec has no scoring section 3.2 or unit-test section 8, and AGENTS.md has no hard rule 6 containing input limits. The user explicitly approved a documented deterministic weighted-fraction scoring contract, unknown-zero behavior, required exclusion, word-based partial text matches and ID tie-breaking, plus a direct pin of the already-installed Zod 4.6.5. The approved contract is `docs/phase-2-contract.md`. Phase 2 uses the actual CSV schema and the user-required 256-dimensional vectors; no Apify enrichment, new business tool, MCP/eve registration or UI was implemented.

Live Phase 2 verification also found that identical Voyage query requests can produce slightly different vectors. Query embedding reuse now uses a 128-entry, 15-minute process-local cache. Exact retrieval sorts similarity descending and ID ascending for a fixed vector/index; cross-restart or post-expiry semantic ordering is not guaranteed. Deterministic scoring does not depend on query vectors. The final full live suite and all 16 local tests pass.
