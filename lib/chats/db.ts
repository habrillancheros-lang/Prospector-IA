import { MongoClient } from "mongodb";
import type { MessageStreamEvent } from "eve/client";
import type { ChatSummary } from "./types.ts";

type ChatDocument = {
  _id: string;
  owner: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
};
type EventDocument = {
  _id: string;
  chatId: string;
  index: number;
  event: MessageStreamEvent;
};

const cache = globalThis as typeof globalThis & {
  chatMongoDb?: Promise<ReturnType<MongoClient["db"]>>;
};

export async function getChatDb() {
  // Never reuse the read-only company credential for chat writes.
  const uri =
    process.env.MONGODB_CHAT_URI ||
    (process.env.NODE_ENV !== "production" ? process.env.MONGODB_IMPORT_URI : undefined);
  const database = process.env.MONGODB_CHAT_DB || process.env.MONGODB_DB;
  if (!uri || !database)
    throw new Error("Configure MONGODB_CHAT_URI and MONGODB_CHAT_DB for chat history");
  if (!cache.chatMongoDb) {
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10_000, maxPoolSize: 10 });
    cache.chatMongoDb = (async () => {
      await client.connect();
      const db = client.db(database);
      await db.collection<ChatDocument>("chats").createIndex({ owner: 1, updatedAt: -1, _id: -1 });
      await db
        .collection<EventDocument>("chat_events")
        .createIndex({ chatId: 1, index: 1 }, { unique: true });
      return db;
    })().catch(async (error: unknown) => {
      cache.chatMongoDb = undefined;
      await client.close().catch(() => {});
      throw error;
    });
  }
  return cache.chatMongoDb;
}

export function chatTitle(message: unknown): string {
  const text =
    typeof message === "string"
      ? message
      : Array.isArray(message)
        ? message
            .filter((part) => part?.type === "text" && typeof part.text === "string")
            .map((part) => part.text)
            .join(" ")
        : "";
  return text.replace(/\s+/g, " ").trim().slice(0, 80) || "New chat";
}

export function chatSummary(chat: ChatDocument): ChatSummary {
  return {
    id: chat._id,
    title: chat.title,
    createdAt: chat.createdAt.toISOString(),
    updatedAt: chat.updatedAt.toISOString(),
  };
}

export async function createChat(id: string, owner: string, title: string) {
  const db = await getChatDb();
  const now = new Date();
  await db.collection<ChatDocument>("chats").updateOne(
    { _id: id, owner },
    {
      $setOnInsert: { title, createdAt: now, updatedAt: now },
    },
    { upsert: true },
  );
}

export async function findChat(id: string, owner: string) {
  return (await getChatDb()).collection<ChatDocument>("chats").findOne({ _id: id, owner });
}

export async function listChats(owner: string, before?: { date: Date; id: string }) {
  const db = await getChatDb();
  const chats = await db
    .collection<ChatDocument>("chats")
    .find({
      owner,
      ...(before
        ? {
            $or: [
              { updatedAt: { $lt: before.date } },
              { updatedAt: before.date, _id: { $lt: before.id } },
            ],
          }
        : {}),
    })
    .sort({ updatedAt: -1, _id: -1 })
    .limit(51)
    .toArray();
  const page = chats.slice(0, 50);
  const last = page.at(-1);
  return {
    chats: page.map(chatSummary),
    nextCursor:
      chats.length > 50 && last
        ? Buffer.from(
            JSON.stringify({ date: last.updatedAt.toISOString(), id: last._id }),
          ).toString("base64url")
        : null,
  };
}

export async function readChatEvents(chatId: string) {
  const rows = await (
    await getChatDb()
  )
    .collection<EventDocument>("chat_events")
    .find({ chatId })
    .sort({ index: 1 })
    .toArray();
  // Only use a contiguous prefix as Eve's replay cursor. A concurrent stream
  // may have archived later chunks before an earlier stream catches up.
  const events: MessageStreamEvent[] = [];
  for (const row of rows) {
    if (row.index !== events.length) break;
    events.push(row.event);
  }
  return events;
}

export async function saveChatEvents(
  chatId: string,
  startIndex: number,
  events: readonly MessageStreamEvent[],
) {
  if (events.length === 0) return;
  const db = await getChatDb();
  await db.collection<EventDocument>("chat_events").bulkWrite(
    events.map((event, offset) => ({
      updateOne: {
        filter: { _id: `${chatId}:${startIndex + offset}` },
        update: { $setOnInsert: { chatId, index: startIndex + offset, event } },
        upsert: true,
      },
    })),
    { ordered: true },
  );
  // Reopening old history must not move it above a newly active chat.
  const at = events
    .map((event) => new Date(event.meta.at))
    .filter((date) => Number.isFinite(date.getTime()));
  if (at.length)
    await db.collection<ChatDocument>("chats").updateOne(
      { _id: chatId },
      {
        $max: { updatedAt: new Date(Math.max(...at.map((date) => date.getTime()))) },
      },
    );
}
