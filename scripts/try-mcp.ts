import assert from "node:assert/strict";
import {
  searchOutputSchema,
  scoreOutputSchema,
  detailsOutputSchema,
} from "../lib/companies/schema.ts";

async function main() {
  const url = process.env.MCP_SERVER_URL ?? "http://localhost:3000/mcp";
  const token = process.env.MCP_API_KEY;
  if (!token) throw new Error("MCP_API_KEY is required");
  let id = 0;
  async function rpc(
    method: string,
    params: Record<string, unknown> = {},
    credential: string | undefined = token,
  ) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "MCP-Protocol-Version": "2025-11-25",
        ...(credential ? { Authorization: `Bearer ${credential}` } : {}),
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
      signal: AbortSignal.timeout(90_000),
    });
    const text = await response.text();
    const packet = text.trim().startsWith("{")
      ? JSON.parse(text)
      : JSON.parse(
          text
            .split("\n")
            .find((line) => line.startsWith("data: "))
            ?.slice(6) ?? "{}",
        );
    return { response, packet };
  }
  const initialize = {
    protocolVersion: "2025-11-25",
    capabilities: {},
    clientInfo: { name: "company-finder-smoke", version: "1.0.0" },
  };
  assert.equal((await rpc("initialize", initialize, "")).response.status, 401);
  assert.equal((await rpc("initialize", initialize, "incorrect-test-token")).response.status, 401);
  assert.equal((await rpc("initialize", initialize)).response.status, 200);
  const listed = await rpc("tools/list");
  assert.deepEqual(listed.packet.result.tools.map((tool: { name: string }) => tool.name).sort(), [
    "get_company",
    "score_companies",
    "search_companies",
  ]);
  const invalid = await rpc("tools/call", {
    name: "search_companies",
    arguments: { filters: { unsupported: ["x"] } },
  });
  assert.ok(invalid.packet.error || invalid.packet.result?.isError);
  const call = async (name: string, args: Record<string, unknown>) => {
    const { packet } = await rpc("tools/call", { name, arguments: args });
    assert.ok(!packet.error && !packet.result.isError, `${name} failed`);
    return packet.result.structuredContent ?? JSON.parse(packet.result.content[0].text);
  };
  const search = searchOutputSchema.parse(
    await call("search_companies", {
      filters: { companyType: ["Private"] },
      semanticQuery: "software services",
      limit: 20,
    }),
  );
  assert.ok(search.returned > 0);
  const score = scoreOutputSchema.parse(
    await call("score_companies", {
      companyIds: search.companies.map((company) => company.id),
      criteria: [
        { field: "companyType", op: "eq", value: "Private", weight: 1, required: true },
        {
          field: "description",
          op: "contains",
          value: "software services",
          weight: 3,
          required: false,
        },
      ],
      topN: 10,
    }),
  );
  assert.equal(score.returned, 10);
  const details = detailsOutputSchema.parse(
    await call("get_company", { companyId: score.companies[0].id }),
  );
  assert.equal(details.status, "found");
  assert.ok(!JSON.stringify(details).includes('"embedding"'));
  const missing = detailsOutputSchema.parse(
    await call("get_company", { companyId: "indian-csv:999999999" }),
  );
  assert.equal(missing.status, "not_found");
  console.log(
    "MCP verification passed: bearer rejection, exactly three tools, invalid-input rejection, semantic search, deterministic top 10 and safe details.",
  );
}
main().catch(() => {
  console.error("MCP verification failed; credentials and server error details are not printed.");
  process.exitCode = 1;
});
