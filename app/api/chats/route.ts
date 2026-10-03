import { NextResponse } from "next/server";
import { listChats } from "@/lib/chats/db";
import {
  CHAT_COOKIE,
  CHAT_COOKIE_MAX_AGE,
  chatOwner,
  isSameOrigin,
  newChatToken,
  readChatToken,
} from "@/lib/chats/identity";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const token = readChatToken(request) ?? newChatToken();
  const cursor = new URL(request.url).searchParams.get("cursor");
  let before: { date: Date; id: string } | undefined;
  if (cursor) {
    try {
      const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString());
      if (
        typeof parsed.id !== "string" ||
        typeof parsed.date !== "string" ||
        !Number.isFinite(Date.parse(parsed.date))
      )
        throw new Error("Invalid cursor");
      before = { id: parsed.id, date: new Date(parsed.date) };
    } catch {
      return NextResponse.json({ error: "Invalid history cursor" }, { status: 400 });
    }
  }
  try {
    const response = NextResponse.json(await listChats(chatOwner(token), before), {
      headers: { "Cache-Control": "no-store" },
    });
    response.cookies.set(CHAT_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: new URL(request.url).protocol === "https:",
      path: "/",
      maxAge: CHAT_COOKIE_MAX_AGE,
    });
    return response;
  } catch {
    return NextResponse.json(
      {
        error: "Chat history is unavailable. Check the chat database configuration and connection.",
      },
      { status: 503 },
    );
  }
}
