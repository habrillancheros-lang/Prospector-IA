import { createHash, randomBytes } from "node:crypto";

export const CHAT_COOKIE = "company-finder-browser";
export const CHAT_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function readChatToken(request: Request): string | undefined {
  const value = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${CHAT_COOKIE}=`))
    ?.slice(CHAT_COOKIE.length + 1);
  return value && /^[a-f0-9]{64}$/.test(value) ? value : undefined;
}

export function newChatToken() {
  return randomBytes(32).toString("hex");
}

export function chatOwner(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return (
    (!origin || origin === new URL(request.url).origin) &&
    request.headers.get("sec-fetch-site") !== "cross-site"
  );
}
