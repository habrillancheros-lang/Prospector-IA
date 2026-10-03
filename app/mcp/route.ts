import { createMcpHandler } from "mcp-handler";
import { searchCompanies } from "../../lib/companies/search.ts";
import { scoreCompanies } from "../../lib/companies/score.ts";
import { getCompany } from "../../lib/companies/details.ts";
import {
  searchInputSchema,
  searchOutputSchema,
  scoreInputSchema,
  scoreOutputSchema,
  detailsInputSchema,
  detailsOutputSchema,
} from "../../lib/companies/schema.ts";
import { authorizedCompanyMcp, companyToolResult } from "../../lib/companies/mcp-safety.ts";

export const runtime = "nodejs";
export const maxDuration = 60;

const handler = createMcpHandler(
  (server) => {
    const annotations = {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    };
    server.registerTool(
      "search_companies",
      {
        description:
          "Find candidates in the fixed Indian company database. Hard filters AND across fields and OR within arrays. For industry or conceptual requests use semanticQuery (Voyage, 256 dimensions). Returns IDs and summaries, not scored recommendations. Always call score_companies before recommending candidates.",
        inputSchema: searchInputSchema,
        outputSchema: searchOutputSchema,
        annotations,
      },
      (input) => companyToolResult(input, searchInputSchema, searchOutputSchema, searchCompanies),
    );
    server.registerTool(
      "score_companies",
      {
        description:
          "Deterministically score candidate IDs from search_companies against supported criteria and return the ranked top 10 with match/partial/miss/unknown breakdowns. Required criteria must fully match. Use the returned order and scores; do not calculate or alter them.",
        inputSchema: scoreInputSchema,
        outputSchema: scoreOutputSchema,
        annotations,
      },
      (input) => companyToolResult(input, scoreInputSchema, scoreOutputSchema, scoreCompanies),
    );
    server.registerTool(
      "get_company",
      {
        description:
          "Read the complete normalized company profile by stable indian-csv ID from previous results. Returns found or not_found, preserving source quality flags and removing embeddings/internal metadata. Does not fetch live registry data.",
        inputSchema: detailsInputSchema,
        outputSchema: detailsOutputSchema,
        annotations,
      },
      (input) =>
        companyToolResult(input, detailsInputSchema, detailsOutputSchema, (value) =>
          getCompany(value.companyId),
        ),
    );
  },
  { serverInfo: { name: "company-finder", version: "1.0.0" }, verboseLogs: false },
);

async function authenticatedHandler(request: Request) {
  if (!authorizedCompanyMcp(request))
    return Response.json(
      { error: { code: "UNAUTHORIZED", message: "A valid bearer credential is required." } },
      {
        status: 401,
        headers: {
          "WWW-Authenticate": 'Bearer realm="company-finder"',
          "Cache-Control": "no-store",
        },
      },
    );
  try {
    return await handler(request);
  } catch {
    return Response.json(
      {
        error: {
          code: "MCP_UNAVAILABLE",
          message: "The company tool service is temporarily unavailable.",
        },
      },
      { status: 503 },
    );
  }
}
export {
  authenticatedHandler as GET,
  authenticatedHandler as POST,
  authenticatedHandler as DELETE,
};
