# Phase 4 — agent quality contract

The supplied spec does not include the referenced sections 5 or 8. This evaluation contract implements the Phase 4 playbook using the user-approved Phase 2 CSV contract and schemas. It does not change database search or scoring calculations.

Explicit company-type, exact employee-band, location and rating constraints appear in hard search filters and required scoring criteria. Preferences appear only in scoring and use `required=false`. OR alternatives for a field use one `in` criterion. Main activity has weight 3; ordinary requirements have weight 1 unless the user specifies priorities. Conceptual activity uses semantic retrieval and a short description criterion. Explicitly required description words use required scoring; this is source-word matching, not verification of business activity.

Unknown explicit values are preserved for the core's suggestions. Zero-result constraints are relaxed only after user consent. Refinements preserve unchanged requirements. Recommendations include only the scored records in returned order with exact returned names and rounded scores. Stable IDs remain internal for tool calls; public text identifies companies by names, attributes and numbered clarification options. Details use a Field/Value table and identity-clarification responses use search output instead of requiring a score. Unsupported-only requests ask for supported criteria and do not invent proxies.

The live suite in `evals/companies/quality.eval.ts` covers 15 conversations: combined hard filters, required activity, pharmaceutical semantic search, vague concepts, soft location, OR alternatives, vocabulary aliases, zero results and consent, refinements, unique-name details, ambiguous-name selection, missing names, unsupported fields, unrelated requests and a user-requested loop. Multi-turn cases share a real durable session. Assertions inspect actual tool input/output, order, flags, weights, candidate IDs and displayed recommendations.

Grounding checks enforce internal ID usage in tool inputs, no exposed IDs/tool names, rank order, exact source names and rounded scores for each numbered recommendation. An additional exact-name scan checks other dataset names of at least eight characters, excluding names in the user's prompt and substrings of allowed names. This deterministic suite cannot prove every free-text claim is factual or detect every invented name outside the dataset; it is a regression suite, not a general hallucination guarantee. Three local tests verify that the recommendation matcher rejects invented or changed names, wrong ordering, altered scores and extra recommendations.

Eve 0.56.0's public `AgentLimitsDefinition` supports session lifetime and token/cost limits, but no per-turn tool-round cap. `experimental.workflow.modelCallsPerStep` controls checkpoint batching rather than total calls. No unsupported cap is added to `agent.ts`. Instructions bound work to eight business calls, prohibit identical successful retries and indefinite loops, and permit at most one failure retry. The loop eval checks observed behavior; this prompt policy is not a hard runtime guard. Each eval has a 600-second runner timeout and cases run serially.

The model remains `glm-5.3-flash`, with its supported `reasoningEffort: low` provider option to reduce interactive latency. Thinking is not disabled. See [Z.ai's model guide](https://docs.z.ai/guides/vlm/glm-5.3-flash) and [thinking controls](https://docs.z.ai/guides/capabilities/thinking-mode).

Run from the repository root with Node 24+, the dev server and existing credentials:

```sh
npm run eval:companies
```

Eve stores local event streams and results in ignored `.eve/evals/`. The suite uses the configured live GLM, read-only MongoDB and Voyage services. No LLM judge, new dependencies, database writes, fourth business tool or Apify connection is introduced.
