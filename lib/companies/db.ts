import { MongoClient } from "mongodb";
import type { CompanyDocument } from "./schema.ts";

const cache = globalThis as typeof globalThis & { companyMongoClient?: Promise<MongoClient> };
export async function closeCompanyDb() {
  const pending = cache.companyMongoClient;
  cache.companyMongoClient = undefined;
  if (pending) await (await pending).close();
}
export async function getCompaniesCollection() {
  const uri = process.env.MONGODB_URI;
  const database = process.env.MONGODB_DB;
  if (!uri || !database) throw new Error("MONGODB_URI and MONGODB_DB are required");
  if (!cache.companyMongoClient) {
    const client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 10_000,
      connectTimeoutMS: 10_000,
      socketTimeoutMS: 30_000,
      maxPoolSize: 10,
    });
    cache.companyMongoClient = client.connect().catch(async () => {
      cache.companyMongoClient = undefined;
      await client.close().catch(() => {});
      throw new Error("MongoDB connection failed; check credentials and Atlas network access");
    });
  }
  return (await cache.companyMongoClient).db(database).collection<CompanyDocument>("companies");
}
