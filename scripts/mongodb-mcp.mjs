import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
try {
  process.loadEnvFile(resolve(root, ".env.local"));
} catch {
  /* Environment variables can also be provided by the host. */
}
const connection = process.env.MONGODB_URI;
if (!connection) {
  console.error("MongoDB MCP requires MONGODB_URI in the project's ignored .env.local.");
  process.exit(1);
}
const env = {
  ...process.env,
  PATH: `${dirname(process.execPath)}:${process.env.PATH ?? ""}`,
  MDB_MCP_CONNECTION_STRING: connection,
  MDB_MCP_READ_ONLY: "true",
};
for (const key of [
  "MONGODB_URI",
  "MONGODB_IMPORT_URI",
  "VOYAGE_API_KEY",
  "GLM_API_KEY",
  "MCP_API_KEY",
  "EVE_CHANNEL_SECRET",
])
  delete env[key];
// Codex development connection only; never registered as a product agent tool.
const child = spawn("npx", ["-y", "mongodb-mcp-server@latest", "--readOnly"], {
  cwd: root,
  env,
  stdio: "inherit",
});
child.on("error", () => {
  console.error("Unable to launch MongoDB MCP; check Node/npm availability.");
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
