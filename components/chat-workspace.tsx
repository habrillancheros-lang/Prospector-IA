"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AssistantRuntimeProvider, AuiConfig, Suggestions } from "@assistant-ui/react";
import { useEveAgentRuntime } from "@assistant-ui/eve";
import { MenuIcon, MessageSquareIcon, PlusIcon, XIcon } from "lucide-react";
import { Thread } from "@/components/assistant-ui/elements/thread.aui";
import { EveAuthorization } from "@/components/eve-authorization";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ChatSummary, SavedChat } from "@/lib/chats/types";

const config = AuiConfig({
  suggestions: Suggestions([
    {
      title: "Find German companies",
      label: "with 51–200 employees",
      prompt: "Find companies in Germany with 51–200 employees.",
    },
    {
      title: "Explore pharmaceutical companies",
      label: "and rank the best matches",
      prompt: "Find pharmaceutical companies and rank the top 10 matches.",
    },
  ]),
});

async function loadJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Unable to load chats");
  return data as T;
}

function ChatSession({
  saved,
  onActivity,
}: {
  saved: SavedChat | null;
  onActivity: (id?: string) => void;
}) {
  const runtime = useEveAgentRuntime({
    host: "/api/chat",
    ...(saved
      ? {
          initialSession: { sessionId: saved.id, streamIndex: saved.streamIndex },
          initialEvents: saved.events,
          resume: true,
        }
      : {}),
    onSessionChange: (session) => {
      if (session) onActivity(session.sessionId);
    },
    onFinish: (snapshot) => onActivity(snapshot.session?.sessionId),
  });
  return (
    <AssistantRuntimeProvider runtime={runtime} config={config}>
      <EveAuthorization />
      <Thread />
    </AssistantRuntimeProvider>
  );
}

export function ChatWorkspace() {
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedChat | null>(null);
  const [activeId, setActiveId] = useState<string>();
  const [sessionKey, setSessionKey] = useState("new");
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [openingId, setOpeningId] = useState<string>();
  const [error, setError] = useState<string>();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const requestVersion = useRef(0);
  const listVersion = useRef(0);
  const activeSessionKey = useRef(sessionKey);

  const refresh = useCallback(async (cursor?: string) => {
    const version = ++listVersion.current;
    setLoading(true);
    try {
      const result = await loadJson<{ chats: ChatSummary[]; nextCursor: string | null }>(
        `/api/chats${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
      );
      if (version !== listVersion.current) return;
      setChats((current) =>
        cursor
          ? [
              ...current,
              ...result.chats.filter((chat) => !current.some((item) => item.id === chat.id)),
            ]
          : result.chats,
      );
      setNextCursor(result.nextCursor);
      setReady(true);
      setError(undefined);
    } catch (failure) {
      if (version === listVersion.current)
        setError(failure instanceof Error ? failure.message : "Unable to load chats");
    } finally {
      if (version === listVersion.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const activity = (id?: string) => {
    if (activeSessionKey.current !== sessionKey) return;
    if (id) setActiveId(id);
    void refresh();
  };

  const openChat = async (id: string) => {
    if (id === activeId) {
      setSidebarOpen(false);
      return;
    }
    const version = ++requestVersion.current;
    setOpeningId(id);
    setError(undefined);
    try {
      const chat = await loadJson<SavedChat>(`/api/chats/${encodeURIComponent(id)}`);
      if (version !== requestVersion.current) return;
      activeSessionKey.current = id;
      setSaved(chat);
      setActiveId(id);
      setSessionKey(id);
      setSidebarOpen(false);
    } catch (failure) {
      if (version === requestVersion.current)
        setError(failure instanceof Error ? failure.message : "Unable to open chat");
    } finally {
      if (version === requestVersion.current) setOpeningId(undefined);
    }
  };

  const newChat = () => {
    ++requestVersion.current;
    const key = crypto.randomUUID();
    activeSessionKey.current = key;
    setSessionKey(key);
    setSaved(null);
    setActiveId(undefined);
    setOpeningId(undefined);
    setSidebarOpen(false);
  };

  return (
    <div className="flex h-full overflow-hidden">
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close chat history"
          className="bg-black/40 fixed inset-0 z-20 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside
        aria-label="Chat history"
        id="chat-history"
        className={cn(
          "bg-muted/40 fixed inset-y-0 left-0 z-30 flex w-72 shrink-0 flex-col border-r bg-background transition-transform md:static md:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between px-4 py-4">
          <span className="font-semibold">Company Finder</span>
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label="Close chat history"
            onClick={() => setSidebarOpen(false)}
          >
            <XIcon className="size-4" />
          </Button>
        </div>
        <div className="px-3">
          <Button
            className="w-full justify-start gap-2"
            variant="outline"
            onClick={newChat}
            disabled={!ready}
          >
            <PlusIcon className="size-4" />
            New chat
          </Button>
        </div>
        <p className="text-muted-foreground px-4 pt-6 pb-2 text-xs font-medium">Recent chats</p>
        <nav aria-label="Saved conversations" className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {loading && chats.length === 0 && (
            <p className="text-muted-foreground px-2 py-3 text-sm" role="status">
              Loading chats…
            </p>
          )}
          {!loading && ready && chats.length === 0 && (
            <p className="text-muted-foreground px-2 py-3 text-sm">
              Your conversations will appear here.
            </p>
          )}
          {chats.map((chat) => (
            <button
              type="button"
              key={chat.id}
              title={chat.title}
              aria-current={activeId === chat.id ? "page" : undefined}
              aria-busy={openingId === chat.id}
              onClick={() => void openChat(chat.id)}
              className={cn(
                "hover:bg-accent focus-visible:ring-ring flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm focus-visible:ring-2",
                activeId === chat.id && "bg-accent font-medium",
              )}
            >
              <MessageSquareIcon className="text-muted-foreground size-4 shrink-0" />
              <span className="truncate">{openingId === chat.id ? "Opening…" : chat.title}</span>
            </button>
          ))}
          {nextCursor && (
            <Button
              variant="ghost"
              className="mt-2 w-full"
              disabled={loading}
              onClick={() => void refresh(nextCursor)}
            >
              {loading ? "Loading…" : "Load older chats"}
            </Button>
          )}
        </nav>
        <p className="text-muted-foreground border-t p-4 text-xs">
          History is saved for this browser.
        </p>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center justify-between border-b px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              aria-label="Open chat history"
              aria-expanded={sidebarOpen}
              aria-controls="chat-history"
              onClick={() => setSidebarOpen(true)}
            >
              <MenuIcon className="size-4" />
            </Button>
            <span className="truncate font-semibold">
              {chats.find((chat) => chat.id === activeId)?.title ?? "New chat"}
            </span>
          </div>
          <ThemeToggle />
        </header>
        {error && (
          <div role="alert" className="border-b px-4 py-3 text-sm text-destructive">
            {error}
            <Button variant="link" onClick={() => void refresh()}>
              Retry
            </Button>
          </div>
        )}
        <div className="min-h-0 flex-1">
          {ready ? (
            <ChatSession key={sessionKey} saved={saved} onActivity={activity} />
          ) : (
            <div className="text-muted-foreground flex h-full items-center justify-center px-6 text-center text-sm">
              {loading
                ? "Loading your workspace…"
                : "Connect the chat database, then retry to start chatting."}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
