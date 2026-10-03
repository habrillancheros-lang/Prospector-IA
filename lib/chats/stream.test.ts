import { test } from "node:test";
import assert from "node:assert/strict";
import { ChatEventDecoder, isChatBoundary } from "./stream.ts";
import { chatOwner, isSameOrigin, newChatToken, readChatToken } from "./identity.ts";
import type { MessageStreamEvent } from "eve/client";

test("event decoding preserves Unicode and split NDJSON records, including an unterminated last record", () => {
  const events = [
    {
      type: "message.received",
      data: { message: "München 🏢", sequence: 1, turnId: "turn-1" },
      meta: { id: "event-1", at: "2026-10-03T00:00:00Z" },
    },
    {
      type: "session.waiting",
      data: { wait: "next-user-message" },
      meta: { id: "event-2", at: "2026-10-03T00:00:01Z" },
    },
  ];
  const bytes = new TextEncoder().encode(events.map((event) => JSON.stringify(event)).join("\n"));
  const decoder = new ChatEventDecoder();
  const decoded: MessageStreamEvent[] = [];
  for (let offset = 0; offset < bytes.length; offset += 3)
    decoded.push(...decoder.push(bytes.slice(offset, offset + 3)));
  decoded.push(...decoder.push());
  assert.deepEqual(decoded, events);
  assert.equal(isChatBoundary(decoded[0]), false);
  assert.equal(isChatBoundary(decoded[1]), true);
});

test("browser identities use unpredictable cookies and invalid identities fail closed", () => {
  const token = newChatToken();
  const request = (cookie: string) =>
    new Request("http://localhost:3000/api/chats", { headers: { cookie } });
  assert.notEqual(newChatToken(), token);
  assert.equal(readChatToken(request(`other=x; company-finder-browser=${token}`)), token);
  assert.equal(readChatToken(request("company-finder-browser=guess")), undefined);
  assert.equal(chatOwner(token).length, 64);
  assert.notEqual(chatOwner(token), token);
  assert.notEqual(chatOwner(newChatToken()), chatOwner(token));
});

test("history endpoints reject cross-site requests", () => {
  const request = (headers: Record<string, string>) =>
    new Request("http://localhost:3000/api/chats", { headers });
  assert.equal(isSameOrigin(request({ origin: "http://localhost:3000" })), true);
  assert.equal(isSameOrigin(request({})), true);
  assert.equal(isSameOrigin(request({ origin: "https://foreign.example" })), false);
  assert.equal(isSameOrigin(request({ "sec-fetch-site": "cross-site" })), false);
});
