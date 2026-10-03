import assert from "node:assert/strict";
import { Client } from "eve/client";

const client = new Client({ host: "http://localhost:3000" });
const cases = [
  { name: "GirnarSoft", detail: true, id: "indian-csv:1003" },
  { name: "Trigent Software", detail: true, id: "indian-csv:2221" },
  { name: "Tudip Technologies", detail: false, id: undefined },
  { name: "NonexistentCompanyZXQ987654", detail: false, id: undefined },
];

for (const sample of cases.filter(
  (item) => process.argv.length <= 2 || process.argv.slice(2).includes(item.name),
)) {
  const { response } = await client.sessions.create({
    message: `Show me the company details for ${sample.name}.`,
  });
  const result = await response.result();
  const calls = new Map<string, { tool: string; input: string }>();
  for (const event of result.events) {
    if (event.type !== "action.input.appended") continue;
    const data = event.data;
    const call = calls.get(data.callId) ?? { tool: data.toolName, input: "" };
    call.input += data.inputTextDelta;
    calls.set(data.callId, call);
  }
  const business = [...calls.values()].filter((call) => call.tool.startsWith("companies__"));
  console.log(JSON.stringify({ name: sample.name, status: result.status, calls: business }));
  assert.ok(
    business.some((call) => call.tool === "companies__search_companies"),
    "Missing name search",
  );
  assert.equal(
    business.some((call) => call.tool === "companies__get_company"),
    sample.detail,
    "Unexpected details resolution",
  );
  assert.ok(
    !business.some((call) => call.tool === "companies__score_companies"),
    "Details request unexpectedly scored companies",
  );
  if (sample.detail) {
    const details = business.find((call) => call.tool === "companies__get_company")!;
    assert.equal(JSON.parse(details.input).companyId, sample.id, "Wrong company resolved");
    assert.equal(
      business[0].tool,
      "companies__search_companies",
      "Name must be resolved before details",
    );
  }
  const answer = result.events
    .flatMap((event) => (event.type === "message.appended" ? [event.data.messageDelta] : []))
    .join("");
  console.log(answer);
  if (sample.name === "Tudip Technologies")
    assert.match(answer, /which|select|choose/i, "Missing ambiguity question");
  if (sample.name === "NonexistentCompanyZXQ987654")
    assert.match(
      answer,
      /no match|not found|couldn.t find|no .*record|zero/i,
      "Missing not-found explanation",
    );
}
console.log("Name-only company checks passed.");
