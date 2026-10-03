import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export function authorizedCompanyMcp(request: Request, key = process.env.MCP_API_KEY): boolean {
  if (!key) return false;
  const authorization = request.headers.get("authorization");
  if (!authorization || authorization.length > 4096 || !authorization.startsWith("Bearer "))
    return false;
  const token = authorization.slice(7);
  return timingSafeEqual(
    createHash("sha256").update(token).digest(),
    createHash("sha256").update(key).digest(),
  );
}

export async function companyToolResult<T>(
  input: unknown,
  inputSchema: z.ZodType<T>,
  outputSchema: z.ZodType,
  execute: (input: T) => Promise<unknown>,
) {
  try {
    const result = outputSchema.parse(await execute(inputSchema.parse(input))) as Record<
      string,
      unknown
    >;
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result) }],
      structuredContent: result,
    };
  } catch (error) {
    const result = {
      error: {
        code: error instanceof z.ZodError ? "INVALID_INPUT_OR_OUTPUT" : "SERVICE_UNAVAILABLE",
        message:
          error instanceof z.ZodError
            ? "The request or result did not match the company tool contract."
            : "The company data service is temporarily unavailable. Retry the request.",
      },
    };
    return {
      isError: true,
      content: [{ type: "text" as const, text: JSON.stringify(result) }],
      structuredContent: result,
    };
  }
}
