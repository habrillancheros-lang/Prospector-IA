import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { MongoClient } from "mongodb";
import { loadDataset } from "./load-dataset.ts";
import { embeddingText } from "../lib/companies/normalize.ts";
import { embedTexts } from "../lib/companies/embeddings.ts";
import {
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
  QUERYABLE_FIELDS,
  VECTOR_INDEX_NAME,
  type CompanyDocument,
} from "../lib/companies/schema.ts";

const VECTOR_DEFINITION = {
  fields: [
    {
      type: "vector",
      path: "embedding",
      numDimensions: EMBEDDING_DIMENSIONS,
      similarity: "cosine",
    },
    ...Object.keys(QUERYABLE_FIELDS).map((path) => ({ type: "filter", path })),
  ],
};
const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));

async function main() {
  const companies = await loadDataset();
  const ids = companies.map((company) => company.id);
  if (process.argv.includes("--dry-run")) {
    console.log(
      `Import dry run passed: ${companies.length} unique source records; embedding model ${EMBEDDING_MODEL}, dimensions ${EMBEDDING_DIMENSIONS}. No API or DB calls made.`,
    );
    return;
  }
  const uri = process.env.MONGODB_IMPORT_URI;
  const database = process.env.MONGODB_DB;
  if (!uri || !database || !process.env.VOYAGE_API_KEY)
    throw new Error("MONGODB_IMPORT_URI, MONGODB_DB and VOYAGE_API_KEY are required");
  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 10_000,
    connectTimeoutMS: 10_000,
    socketTimeoutMS: 30_000,
  });
  try {
    await client.connect();
    const collection = client.db(database).collection<CompanyDocument>("companies");
    // Dedicated collection only: never delete unrelated or stale documents silently.
    if (await collection.countDocuments({ id: { $nin: ids } }))
      throw new Error("Collection contains records outside this dataset; use a dedicated database");
    await collection.createIndex({ id: 1 }, { unique: true });
    for (const field of Object.keys(QUERYABLE_FIELDS)) await collection.createIndex({ [field]: 1 });
    let generated = 0;
    for (let offset = 0; offset < companies.length; offset += 16) {
      const batch = companies.slice(offset, offset + 16);
      const existing = await collection
        .find({ id: { $in: batch.map((company) => company.id) } })
        .toArray();
      const pending = batch
        .map((company) => {
          const text = embeddingText(company);
          return { company, text, hash: createHash("sha256").update(text).digest("hex") };
        })
        .filter(({ company, hash }) => {
          const previous = existing.find((item) => item.id === company.id);
          return (
            !previous ||
            previous.embeddingModel !== EMBEDDING_MODEL ||
            previous.embeddingTextHash !== hash ||
            !Array.isArray(previous.embedding) ||
            previous.embedding.length !== EMBEDDING_DIMENSIONS ||
            !previous.embedding.every((value) => Number.isFinite(value))
          );
        });
      const vectors = pending.length
        ? await embedTexts(
            pending.map((item) => item.text),
            "document",
          )
        : [];
      const fresh = new Map(
        pending.map((item, index) => [
          item.company.id,
          { vector: vectors[index], hash: item.hash },
        ]),
      );
      await collection.bulkWrite(
        batch.map((company) => {
          const previous = existing.find((item) => item.id === company.id);
          const next = fresh.get(company.id);
          return {
            replaceOne: {
              filter: { id: company.id },
              replacement: {
                ...company,
                embedding: next?.vector ?? previous!.embedding,
                embeddingModel: EMBEDDING_MODEL,
                embeddingTextHash: next?.hash ?? previous!.embeddingTextHash,
              },
              upsert: true,
            },
          };
        }),
        { ordered: true },
      );
      generated += pending.length;
      console.log(
        `Imported ${Math.min(offset + batch.length, companies.length)}/${companies.length} company records; generated ${generated} vectors (${EMBEDDING_DIMENSIONS} dimensions each).`,
      );
    }
    const indexes = await collection.listSearchIndexes(VECTOR_INDEX_NAME).toArray();
    if (!indexes.length)
      await collection.createSearchIndex({
        name: VECTOR_INDEX_NAME,
        type: "vectorSearch",
        definition: VECTOR_DEFINITION,
      });
    else if (
      !("latestDefinition" in indexes[0]) ||
      !isDeepStrictEqual(indexes[0].latestDefinition, VECTOR_DEFINITION)
    )
      throw new Error("Existing vector index definition differs; inspect it before replacing");
    let ready = false;
    for (let attempt = 0; attempt < 120; attempt++) {
      const [index] = await collection.listSearchIndexes(VECTOR_INDEX_NAME).toArray();
      if (index && "status" in index && index.status === "FAILED")
        throw new Error("Atlas vector index build failed");
      if (
        index &&
        "queryable" in index &&
        index.queryable === true &&
        "status" in index &&
        index.status === "READY"
      ) {
        ready = true;
        break;
      }
      await wait(5000);
    }
    if (!ready) throw new Error("Vector index is still building; rerun import to verify readiness");
    const docs = await collection
      .find({}, { projection: { id: 1, embedding: 1, embeddingModel: 1 } })
      .toArray();
    if (
      docs.length !== companies.length ||
      docs.some(
        (doc) =>
          doc.embeddingModel !== EMBEDDING_MODEL ||
          !Array.isArray(doc.embedding) ||
          doc.embedding.length !== EMBEDDING_DIMENSIONS ||
          !doc.embedding.every((value) => Number.isFinite(value)),
      )
    )
      throw new Error("Stored dataset count or embedding verification failed");
    const [result] = await collection
      .aggregate([
        {
          $vectorSearch: {
            index: VECTOR_INDEX_NAME,
            path: "embedding",
            queryVector: docs[0].embedding,
            numCandidates: 20,
            limit: 1,
          },
        },
        { $project: { id: 1 } },
      ])
      .toArray();
    if (!result)
      throw new Error("Vector index returned no records; indexing may still be catching up");
    console.log(
      `Verified ${docs.length} embeddings and a working ${VECTOR_INDEX_NAME} Vector Search index.`,
    );
  } finally {
    await client.close();
  }
}
main().catch((error: unknown) => {
  // Driver errors can include connection details. Only our own known errors are displayed.
  const message =
    error instanceof Error &&
    /^(MONGODB_|Collection contains|Existing vector|Atlas vector|Vector index|Stored dataset|Invalid |Voyage embedding|VOYAGE_|Unexpected dataset|Dataset |Duplicate source|Malformed record|Missing company)/.test(
      error.message,
    )
      ? error.message
      : "Import failed; check Atlas connectivity and permissions. Completed batches are retained for a resumable rerun.";
  console.error(message);
  process.exitCode = 1;
});
