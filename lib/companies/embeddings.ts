import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } from "./schema.ts";

export function createQueryEmbeddingCache(
  embed: typeof embedTexts = embedTexts,
): typeof embedTexts {
  const entries = new Map<string, { expiresAt: number; pending: Promise<number[][]> }>();
  return async (texts, type, apiKey, fetcher) => {
    if (type !== "query" || texts.length !== 1 || apiKey !== undefined || fetcher !== undefined)
      return embed(texts, type, apiKey, fetcher);
    const key = JSON.stringify([EMBEDDING_MODEL, EMBEDDING_DIMENSIONS, texts[0]]);
    const previous = entries.get(key);
    if (previous && previous.expiresAt > Date.now())
      return (await previous.pending).map((vector) => [...vector]);
    entries.delete(key);
    if (entries.size >= 128) {
      const oldest = entries.keys().next().value;
      if (oldest !== undefined) entries.delete(oldest);
    }
    const pending = embed(texts, type);
    entries.set(key, { expiresAt: Date.now() + 15 * 60_000, pending });
    try {
      return (await pending).map((vector) => [...vector]);
    } catch (error) {
      if (entries.get(key)?.pending === pending) entries.delete(key);
      throw error;
    }
  };
}

export const embedQueryTexts = createQueryEmbeddingCache();

export async function embedTexts(
  texts: string[],
  inputType: "document" | "query",
  apiKey = process.env.VOYAGE_API_KEY,
  fetcher: typeof fetch = fetch,
): Promise<number[][]> {
  if (!apiKey) throw new Error("VOYAGE_API_KEY is required");
  if (!texts.length || texts.length > 32 || texts.some((text) => !text.trim()))
    throw new Error("Embedding batch must contain 1–32 non-empty texts");
  const response = await fetcher("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      input: texts,
      model: EMBEDDING_MODEL,
      input_type: inputType,
      output_dimension: EMBEDDING_DIMENSIONS,
      truncation: false,
    }),
    signal: AbortSignal.timeout(60_000),
  });
  // Never expose response bodies: they may contain request data or secrets.
  if (!response.ok) throw new Error(`Voyage embedding request failed (HTTP ${response.status})`);
  const body: unknown = await response.json();
  if (
    !body ||
    typeof body !== "object" ||
    !("data" in body) ||
    !Array.isArray(body.data) ||
    body.data.length !== texts.length
  )
    throw new Error("Invalid Voyage response");
  const vectors: number[][] = [];
  for (const item of body.data) {
    if (
      !item ||
      typeof item !== "object" ||
      !Number.isInteger(item.index) ||
      item.index < 0 ||
      item.index >= texts.length ||
      vectors[item.index] ||
      !Array.isArray(item.embedding) ||
      item.embedding.length !== EMBEDDING_DIMENSIONS ||
      !item.embedding.every((value: unknown) => typeof value === "number" && Number.isFinite(value))
    )
      throw new Error("Invalid Voyage embedding");
    vectors[item.index] = item.embedding;
  }
  return vectors;
}
