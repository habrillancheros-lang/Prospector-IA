import { findChat, chatSummary, readChatEvents } from "@/lib/chats/db";
import { chatOwner, isSameOrigin, readChatToken } from "@/lib/chats/identity";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const token = readChatToken(request);
  if (!token || !isSameOrigin(request))
    return Response.json({ error: "Forbidden" }, { status: 403 });
  try {
    const { id } = await context.params;
    const chat = await findChat(id, chatOwner(token));
    if (!chat) return Response.json({ error: "Chat not found" }, { status: 404 });
    const events = await readChatEvents(id);
    return Response.json(
      { ...chatSummary(chat), events, streamIndex: events.length },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json({ error: "Unable to load this chat. Please try again." }, { status: 503 });
  }
}
