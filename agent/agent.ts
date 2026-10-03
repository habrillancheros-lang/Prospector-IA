import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { defineAgent } from "eve";

const zai = createOpenAICompatible({
  name: "zai",
  apiKey: process.env.GLM_API_KEY,
  baseURL: "https://api.z.ai/api/paas/v4",
});

export default defineAgent({
  defaultTools: false,
  model: zai("glm-5.3-flash"),
  modelOptions: { providerOptions: { zai: { reasoningEffort: "low" } } },
  modelContextWindowTokens: 250_000,
});
