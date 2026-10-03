import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { authorizedCompanyMcp, companyToolResult } from "./mcp-safety.ts";
test("MCP bearer authorization fails closed and rejects missing or incorrect tokens", () => {
  const request = (value?: string) =>
    new Request("http://localhost/mcp", { headers: value ? { authorization: value } : {} });
  assert.equal(authorizedCompanyMcp(request("Bearer test"), "test"), true);
  for (const value of [undefined, "Bearer wrong", "Basic test", "Bearer test-more"])
    assert.equal(authorizedCompanyMcp(request(value), "test"), false);
  assert.equal(authorizedCompanyMcp(request("Bearer test"), ""), false);
});
test("MCP handlers validate before execution and suppress service error details", async () => {
  const schema = z.strictObject({ id: z.string() });
  let called = false;
  const invalid = await companyToolResult({ wrong: true }, schema, schema, async () => {
    called = true;
    return {};
  });
  assert.equal(invalid.isError, true);
  assert.equal(called, false);
  const failure = await companyToolResult({ id: "1" }, schema, schema, async () => {
    throw new Error("secret URI and stack");
  });
  assert.equal(failure.isError, true);
  assert.equal(JSON.stringify(failure).includes("secret"), false);
  const success = await companyToolResult({ id: "1" }, schema, schema, async (value) => value);
  assert.deepEqual(success.structuredContent, { id: "1" });
});
