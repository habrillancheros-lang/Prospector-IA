import assert from "node:assert/strict";
import { test } from "node:test";
import { deploymentProblems, productionMcpUrl } from "./config.ts";

const configured = {
  GLM_API_KEY: "model-test-key",
  VOYAGE_API_KEY: "embedding-test-key",
  MONGODB_URI: "mongodb+srv://reader:example@atlas.example/",
  MONGODB_DB: "companies",
  MONGODB_CHAT_URI: "mongodb+srv://chat:example@atlas.example/",
  MCP_API_KEY: "mcp-test-key",
  MCP_SERVER_URL: "https://demo.example/mcp",
};

test("production accepts a complete environment with a separate chat credential", () => {
  assert.deepEqual(deploymentProblems(configured), []);
  assert.equal(productionMcpUrl(configured.MCP_SERVER_URL), configured.MCP_SERVER_URL);
});

test("production requires a chat credential even when an import credential exists", () => {
  assert.deepEqual(
    deploymentProblems({
      ...configured,
      MONGODB_CHAT_URI: undefined,
      MONGODB_IMPORT_URI: "mongodb+srv://import:example@atlas.example/",
    }),
    ["MONGODB_CHAT_URI is required"],
  );
  assert.match(
    deploymentProblems({ ...configured, MONGODB_CHAT_URI: configured.MONGODB_URI }).join("\n"),
    /separate credential/,
  );
});

test("production rejects local, malformed, credential-bearing and non-MCP endpoints", () => {
  for (const url of [
    undefined,
    "",
    "not-a-url",
    "http://demo.example/mcp",
    "https://localhost/mcp",
    "https://agent.localhost/mcp",
    "https://127.1/mcp",
    "https://[::1]/mcp",
    "https://user:secret@demo.example/mcp",
    "https://demo.example/mcp?key=secret",
    "https://demo.example/mcp#fragment",
    "https://demo.example/",
  ])
    assert.throws(() => productionMcpUrl(url), /public HTTPS URL ending in \/mcp/);
});

test("deployment diagnostics identify missing keys without including secret values", () => {
  const problems = deploymentProblems({ ...configured, GLM_API_KEY: " ", MCP_API_KEY: undefined });
  assert.deepEqual(problems, ["GLM_API_KEY is required", "MCP_API_KEY is required"]);
  assert.ok(!JSON.stringify(problems).includes(configured.VOYAGE_API_KEY));
});
