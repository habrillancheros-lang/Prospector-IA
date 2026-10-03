import { after } from "next/server";
import { chatTitle, createChat, findChat, getChatDb, saveChatEvents } from "@/lib/chats/db";
import { chatOwner, isSameOrigin, readChatToken } from "@/lib/chats/identity";
import { ChatEventDecoder, isChatBoundary } from "@/lib/chats/stream";
import type { MessageStreamEvent } from "eve/client";

export const runtime = "nodejs";
export const maxDuration = 300;
type Context = { params: Promise<{ path: string[] }> };

async function proxy(request: Request, context: Context) {
  const token = readChatToken(request);
  if (!token || !isSameOrigin(request))
    return Response.json(
      { error: "Initialize chat history before sending a message." },
      { status: 403 },
    );
  const { path } = await context.params;
  const [resource, id, action] = path;
  const isCreate = request.method === "POST" && resource === "session" && path.length === 1;
  const isStream =
    request.method === "GET" && resource === "session" && action === "stream" && path.length === 3;
  const isControl =
    request.method === "POST" &&
    resource === "session" &&
    id &&
    (path.length === 2 ||
      (path.length === 3 && ["cancel", "clear", "compact", "reset"].includes(action)));
  if (!isCreate && !isStream && !isControl)
    return Response.json({ error: "Not found" }, { status: 404 });
  const incoming = new URL(request.url);
  const index = Number(incoming.searchParams.get("startIndex") ?? 0);
  if (isStream && (!Number.isSafeInteger(index) || index < 0))
    return Response.json({ error: "Invalid stream cursor" }, { status: 400 });
  try {
    await getChatDb();
    const owner = chatOwner(token);
    if (id && !(await findChat(id, owner)))
      return Response.json({ error: "Chat not found" }, { status: 404 });
    const headers = new Headers({ "content-type": "application/json" });
    for (const name of ["authorization", "cookie"]) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    const body = request.method === "POST" ? await request.text() : undefined;
    const upstream = new URL(`/eve/v1/${path.map(encodeURIComponent).join("/")}`, incoming.origin);
    upstream.search = incoming.search;
    const response = await fetch(upstream, {
      method: request.method,
      headers,
      body,
      cache: "no-store",
      redirect: "manual",
    });
    if (isCreate && response.ok) {
      const accepted = (await response.clone().json()) as { sessionId: string };
      await createChat(accepted.sessionId, owner, chatTitle(JSON.parse(body!).message));
    }
    const forwarded = new Headers({ "Cache-Control": "no-store" });
    for (const [name, value] of response.headers) {
      if (name === "content-type" || name === "x-accel-buffering" || name.startsWith("x-eve-"))
        forwarded.set(name, value);
    }
    if (!isStream || !response.ok || !response.body)
      return new Response(response.body, { status: response.status, headers: forwarded });
    let disconnected = false;
    let completion: Promise<void>;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        completion = (async () => {
          const reader = response.body!.getReader();
          const decoder = new ChatEventDecoder();
          let nextIndex = index;
          let pending: MessageStreamEvent[] = [];
          let lastWrite = Date.now();
          const flush = async () => {
            await saveChatEvents(id, nextIndex, pending);
            nextIndex += pending.length;
            pending = [];
            lastWrite = Date.now();
          };
          try {
            while (true) {
              const { value, done } = await reader.read();
              const events = decoder.push(done ? undefined : value);
              pending.push(...events);
              if (
                done ||
                pending.length >= 25 ||
                Date.now() - lastWrite >= 500 ||
                events.some(isChatBoundary)
              )
                await flush();
              if (done) break;
              if (!disconnected) controller.enqueue(value!);
              if (disconnected && events.some(isChatBoundary)) {
                await flush();
                await reader.cancel();
                break;
              }
            }
            if (!disconnected) controller.close();
          } catch {
            await flush().catch(() => {});
            await reader.cancel().catch(() => {});
            if (!disconnected)
              controller.error(new Error("Chat stream could not be saved. Please retry."));
          } finally {
            reader.releaseLock();
          }
        })();
      },
      cancel() {
        disconnected = true;
      },
    });
    after(async () => {
      await completion;
    });
    return new Response(stream, { status: response.status, headers: forwarded });
  } catch {
    return Response.json(
      { error: "Unable to save or load chat. Check the chat database connection." },
      { status: 503 },
    );
  }
}

export const GET = proxy;
export const POST = proxy;
