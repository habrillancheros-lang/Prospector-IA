import { defineMcpClientConnection } from "eve/connections";

export default defineMcpClientConnection({
  url: process.env.MCP_SERVER_URL ?? "http://localhost:3000/mcp",
  description:
    "Company Finder database: find companies by industry, business activity, location, company type, employee band or rating; deterministically score search candidates into a ranked top 10; retrieve a company profile by stable ID. Discover search_companies, score_companies and get_company for company search and details requests.",
  auth: {
    credentialOwner: "app",
    getToken: async () => {
      const token = process.env.MCP_API_KEY;
      if (!token) throw new Error("MCP_API_KEY is required for the companies connection");
      return { token };
    },
  },
  tools: { allow: ["search_companies", "score_companies", "get_company"] },
});
