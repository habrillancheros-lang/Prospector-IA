type Environment = Record<string, string | undefined>;

export function productionMcpUrl(value: string | undefined): string {
  const message = "MCP_SERVER_URL must be a public HTTPS URL ending in /mcp";
  if (!value?.trim()) throw new Error(message);
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error(message);
  }
  const host = url.hostname.toLowerCase();
  if (
    url.protocol !== "https:" ||
    url.pathname !== "/mcp" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host === "[::1]" ||
    host === "[::]" ||
    host.startsWith("127.") ||
    host === "0.0.0.0"
  )
    throw new Error(message);
  return url.href;
}

export function deploymentProblems(env: Environment): string[] {
  const problems: string[] = [];
  for (const key of [
    "GLM_API_KEY",
    "VOYAGE_API_KEY",
    "MONGODB_URI",
    "MONGODB_DB",
    "MONGODB_CHAT_URI",
    "MCP_API_KEY",
  ]) {
    if (!env[key]?.trim()) problems.push(`${key} is required`);
  }
  try {
    productionMcpUrl(env.MCP_SERVER_URL);
  } catch (error) {
    problems.push((error as Error).message);
  }
  if (env.MONGODB_CHAT_URI && env.MONGODB_CHAT_URI === env.MONGODB_URI)
    problems.push("MONGODB_CHAT_URI must use a separate credential from MONGODB_URI");
  return problems;
}
