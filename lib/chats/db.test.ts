import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import type { Db } from "mongodb";
import type { MessageStreamEvent } from "eve/client";
import { DELETE } from "../../app/api/chats/[id]/route.ts";
import { deleteChat, saveChatEvents } from "./db.ts";
import { chatOwner } from "./identity.ts";

const token = "a".repeat(64);
const owner = chatOwner(token);
const event = {
  type: "session.waiting",
  data: { wait: "next-user-message" },
  meta: { id: "event-1", at: "2026-10-04T00:00:00Z" },
} as MessageStreamEvent;
const cache = globalThis as typeof globalThis & { chatMongoDb?: Promise<Db> };
let previousDb: Promise<Db> | undefined;
let previousUri: string | undefined;
let previousDatabase: string | undefined;
let chats: Map<string, { owner: string }>;
let events: Map<string, { chatId: string }>;
let failEventDelete: boolean;
let ended: boolean;
let activeTransaction: boolean;
let archiveWrites: number;

beforeEach(() => {
  previousDb = cache.chatMongoDb;
  previousUri = process.env.MONGODB_CHAT_URI;
  previousDatabase = process.env.MONGODB_CHAT_DB;
  process.env.MONGODB_CHAT_URI = "mongodb://unused-test-host";
  process.env.MONGODB_CHAT_DB = "chat-tests";
  chats = new Map([
    ["mine", { owner }],
    ["other", { owner: "someone-else" }],
  ]);
  events = new Map([
    ["mine:0", { chatId: "mine" }],
    ["other:0", { chatId: "other" }],
  ]);
  failEventDelete = false;
  ended = false;
  activeTransaction = false;
  archiveWrites = 0;
  const session = {
    async withTransaction<T>(callback: () => Promise<T>) {
      const initialChats = new Map(chats);
      const initialEvents = new Map(events);
      activeTransaction = true;
      try {
        return await callback();
      } catch (error) {
        chats = initialChats;
        events = initialEvents;
        throw error;
      } finally {
        activeTransaction = false;
      }
    },
    async endSession() {
      ended = true;
    },
  };
  const assertTransaction = (options: { session: unknown }) => {
    assert.equal(options.session, session);
    assert.equal(activeTransaction, true);
  };
  cache.chatMongoDb = Promise.resolve({
    client: { startSession: () => session },
    collection(name: string) {
      if (name === "chats")
        return {
          async deleteOne(filter: { _id: string; owner: string }, options: { session: unknown }) {
            assertTransaction(options);
            if (chats.get(filter._id)?.owner !== filter.owner) return { deletedCount: 0 };
            chats.delete(filter._id);
            return { deletedCount: 1 };
          },
          async updateOne(
            filter: { _id: string },
            update: { $inc: { eventWriteVersion: number } },
            options: { session: unknown },
          ) {
            assertTransaction(options);
            assert.equal(update.$inc.eventWriteVersion, 1);
            return { matchedCount: chats.has(filter._id) ? 1 : 0 };
          },
        };
      assert.equal(name, "chat_events");
      return {
        async deleteMany(filter: { chatId: string }, options: { session: unknown }) {
          assertTransaction(options);
          if (failEventDelete) throw new Error("private database failure");
          for (const [key, value] of events) if (value.chatId === filter.chatId) events.delete(key);
        },
        async bulkWrite(_operations: unknown, options: { session: unknown }) {
          assertTransaction(options);
          ++archiveWrites;
        },
      };
    },
  } as unknown as Db);
});

afterEach(() => {
  cache.chatMongoDb = previousDb;
  if (previousUri === undefined) delete process.env.MONGODB_CHAT_URI;
  else process.env.MONGODB_CHAT_URI = previousUri;
  if (previousDatabase === undefined) delete process.env.MONGODB_CHAT_DB;
  else process.env.MONGODB_CHAT_DB = previousDatabase;
});

function request(headers: Record<string, string> = {}) {
  return new Request("http://localhost:3000/api/chats/mine", {
    method: "DELETE",
    headers: { cookie: `company-finder-browser=${token}`, ...headers },
  });
}
const context = (id: string) => ({ params: Promise.resolve({ id }) });

test("deletion removes the owned chat and its messages, preserving other chats", async () => {
  const response = await DELETE(request(), context("mine"));
  assert.equal(response.status, 204);
  assert.equal(await response.text(), "");
  assert.equal(chats.has("mine"), false);
  assert.equal(events.has("mine:0"), false);
  assert.equal(chats.has("other"), true);
  assert.equal(events.has("other:0"), true);
  assert.equal(ended, true);
});

test("missing and foreign-owned chats return 404 without deleting messages", async () => {
  for (const id of ["missing", "other"]) {
    assert.equal((await DELETE(request(), context(id))).status, 404);
  }
  assert.equal(chats.size, 2);
  assert.equal(events.size, 2);
});

test("deletion rejects missing identity and cross-site requests before database access", async () => {
  const invalidHeaders: Record<string, string>[] = [
    { cookie: "" },
    { origin: "https://foreign.example" },
    { "sec-fetch-site": "cross-site" },
  ];
  for (const headers of invalidHeaders) {
    assert.equal((await DELETE(request(headers), context("mine"))).status, 403);
  }
  assert.equal(ended, false);
  assert.equal(chats.size, 2);
});

test("event cleanup failure rolls back deletion and returns a retryable, sanitized error", async () => {
  failEventDelete = true;
  const response = await DELETE(request(), context("mine"));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: "Unable to delete this chat. Please try again.",
  });
  assert.equal(chats.has("mine"), true);
  assert.equal(events.has("mine:0"), true);
  assert.equal(ended, true);
});

test("an active stream cannot archive messages after its chat has been deleted", async () => {
  await saveChatEvents("mine", 1, [event]);
  assert.equal(archiveWrites, 1);
  assert.equal(await deleteChat("mine", owner), true);
  await saveChatEvents("mine", 2, [event]);
  assert.equal(archiveWrites, 1);
  assert.equal(events.has("mine:0"), false);
  assert.equal(chats.has("mine"), false);
});
