import assert from "node:assert/strict";
import { Client } from "eve/client";
const client = new Client({ host: "http://localhost:3000" });
async function main() {
  const cases = [
    { message: "Find pharmaceutical manufacturing companies and rank the top 10.", scoring: true },
    {
      message:
        "Find private software companies in Mumbai with the exact employee band 51-200. Rank up to 10.",
      scoring: true,
    },
    {
      message:
        "Find companies with the exact reported location Atlantis. Do not relax this requirement.",
      scoring: false,
    },
  ];
  for (const sample of cases) {
    const { session, response } = await client.sessions.create({ message: sample.message });
    const result = await response.result();
    const tools = [
      ...new Set(
        result.events.flatMap((event) =>
          event.type === "action.input.appended" ? [event.data.toolName] : [],
        ),
      ),
    ];
    assert.ok(tools.includes("companies__search_companies"), "Agent did not search companies");
    if (sample.scoring)
      assert.ok(
        tools.indexOf("companies__score_companies") > tools.indexOf("companies__search_companies"),
        "Agent did not search before scoring",
      );
    else assert.ok(!tools.includes("companies__score_companies"), "Agent scored an empty search");
    console.log(JSON.stringify({ query: sample.message, status: result.status, tools }));
    if (sample.scoring) {
      const details = await (
        await session.send("Show the details of the first company in your ranked results.")
      ).result();
      const detailTools = [
        ...new Set(
          details.events.flatMap((event) =>
            event.type === "action.input.appended" ? [event.data.toolName] : [],
          ),
        ),
      ];
      assert.ok(detailTools.includes("companies__get_company"), "Details did not call get_company");
      console.log(
        JSON.stringify({
          followup: "first company details",
          status: details.status,
          tools: detailTools,
        }),
      );
    }
  }
  console.log("Agent MCP workflow smoke checks passed.");
}
main().catch((error: unknown) => {
  console.error(
    `Agent workflow verification failed (${error instanceof Error ? error.name : "unknown"}); no credentials or raw service errors printed.`,
  );
  process.exitCode = 1;
});
