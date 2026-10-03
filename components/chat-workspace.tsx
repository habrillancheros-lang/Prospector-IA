"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AssistantRuntimeProvider, AuiConfig, Suggestions } from "@assistant-ui/react";
import { useEveAgentRuntime } from "@assistant-ui/eve";
import {
  LoaderCircleIcon,
  MenuIcon,
  MessageSquareIcon,
  SquarePenIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { CompanyFinderMark } from "@/components/company-finder-mark";
import { Thread } from "@/components/assistant-ui/elements/thread.aui";
import { EveAuthorization } from "@/components/eve-authorization";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

function ChatHistoryLoading() {
  return (
    <div role="status" className="space-y-1" aria-label="Loading chat history">
      <span className="sr-only">Loading chat history</span>
      <div aria-hidden="true">
        {["w-32", "w-40", "w-28", "w-36", "w-24"].map((width) => (
          <div key={width} className="flex h-10 items-center gap-2.5 px-3">
            <Skeleton className="bg-sidebar-accent size-4 shrink-0 rounded" />
            <Skeleton className={cn("bg-sidebar-accent h-3 rounded-full", width)} />
          </div>
        ))}
      </div>
    </div>
  );
}

function WorkspaceLoading() {
  return (
    <div
      role="status"
      aria-label="Loading workspace"
      className="flex h-full items-center justify-center overflow-y-auto px-4 py-8"
    >
      <span className="sr-only">Loading workspace</span>
      <div aria-hidden="true" className="my-auto flex w-full max-w-3xl flex-col items-center">
        <div className="text-muted-foreground relative mb-7 flex size-14 items-center justify-center">
          <span className="border-border border-t-muted-foreground/70 absolute inset-0 animate-spin rounded-full border-2 motion-reduce:animate-none" />
          <CompanyFinderMark className="size-8" />
        </div>
        <Skeleton className="h-8 w-4/5 max-w-md rounded-lg" />
        <Skeleton className="mt-4 h-3 w-3/5 max-w-sm rounded-full" />
        <div className="bg-card/40 mt-8 w-full rounded-3xl border border-border/70 p-5">
          <Skeleton className="h-4 w-44 max-w-full rounded-full" />
          <div className="mt-8 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Skeleton className="size-7 rounded-full" />
              <Skeleton className="h-3 w-24 rounded-full" />
            </div>
            <Skeleton className="size-9 rounded-full" />
          </div>
        </div>
        <div className="mt-4 grid w-full gap-2 sm:grid-cols-2">
          {[0, 1].map((index) => (
            <div
              key={index}
              className="flex items-start gap-3 rounded-2xl border border-border/70 p-4"
            >
              <Skeleton className="size-4 shrink-0 rounded-full" />
              <div className="flex-1 space-y-3">
                <Skeleton className="h-3 w-3/4 rounded-full" />
                <Skeleton className="h-2.5 w-1/2 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ChatSession({
  saved,
  onActivity,
  onNewChat,
}: {
  saved: SavedChat | null;
  onActivity: (id?: string) => void;
  onNewChat: () => void;
}) {
  const [sessionError, setSessionError] = useState<string>();
  const [expired, setExpired] = useState(false);
  const runtime = useEveAgentRuntime({
    host: "/api/chat",
    isSendDisabled: expired,
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
    onError: (failure) => {
      const code = "code" in failure ? failure.code : undefined;
      const isExpired = code === "session_not_active";
      setExpired(isExpired);
      setSessionError(
        isExpired
          ? "This conversation is saved, but its live session has expired. Start a new chat to continue searching."
          : "The message could not be sent or saved. Please try again.",
      );
    },
    onFinish: (snapshot) => {
      if (!snapshot.error) setSessionError(undefined);
      onActivity(snapshot.session?.sessionId);
    },
  });
  return (
    <AssistantRuntimeProvider runtime={runtime} config={config}>
      <EveAuthorization />
      <div className="flex h-full flex-col">
        {sessionError && (
          <div role="alert" className="border-b px-4 py-3 text-sm text-destructive">
            {sessionError}
            {expired && (
              <Button variant="link" onClick={onNewChat}>
                New chat
              </Button>
            )}
          </div>
        )}
        <div className="min-h-0 flex-1">
          <Thread />
        </div>
      </div>
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
  const [chatToDelete, setChatToDelete] = useState<ChatSummary | null>(null);
  const [deletingId, setDeletingId] = useState<string>();
  const [deleteError, setDeleteError] = useState<string>();
  const requestVersion = useRef(0);
  const listVersion = useRef(0);
  const activeSessionKey = useRef(sessionKey);
  const activeChatId = useRef<string | undefined>(undefined);
  const deletedChatIds = useRef(new Set<string>());

  const refresh = useCallback(async (cursor?: string) => {
    const version = ++listVersion.current;
    setLoading(true);
    try {
      const result = await loadJson<{ chats: ChatSummary[]; nextCursor: string | null }>(
        `/api/chats${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
      );
      if (version !== listVersion.current) return;
      const visibleChats = result.chats.filter((chat) => !deletedChatIds.current.has(chat.id));
      setChats((current) =>
        cursor
          ? [
              ...current,
              ...visibleChats.filter((chat) => !current.some((item) => item.id === chat.id)),
            ]
          : visibleChats,
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
    if (id && deletedChatIds.current.has(id)) return;
    if (id) {
      activeChatId.current = id;
      setActiveId(id);
    }
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
      if (version !== requestVersion.current || deletedChatIds.current.has(id)) return;
      activeSessionKey.current = id;
      activeChatId.current = id;
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
    activeChatId.current = undefined;
    setSessionKey(key);
    setSaved(null);
    setActiveId(undefined);
    setOpeningId(undefined);
    setSidebarOpen(false);
  };

  const removeChat = async () => {
    if (!chatToDelete || deletingId) return;
    const id = chatToDelete.id;
    setDeletingId(id);
    setDeleteError(undefined);
    if (openingId === id) {
      ++requestVersion.current;
      setOpeningId(undefined);
    }
    try {
      const response = await fetch(`/api/chats/${encodeURIComponent(id)}`, { method: "DELETE" });
      // A missing chat was already removed (for example, in another tab).
      if (!response.ok && response.status !== 404) {
        const data = await response.json();
        throw new Error(data.error ?? "Unable to delete this chat. Please try again.");
      }
      deletedChatIds.current.add(id);
      ++listVersion.current;
      setLoading(false);
      setChats((current) => current.filter((chat) => chat.id !== id));
      if (activeChatId.current === id) newChat();
      setChatToDelete(null);
    } catch (failure) {
      setDeleteError(failure instanceof Error ? failure.message : "Unable to delete this chat.");
    } finally {
      setDeletingId(undefined);
    }
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
          "bg-sidebar fixed inset-y-0 left-0 z-30 flex w-64 shrink-0 flex-col transition-transform motion-reduce:transition-none md:static md:translate-x-0",
          sidebarOpen ? "translate-x-0" : "invisible -translate-x-full md:visible",
        )}
      >
        <div className="flex h-16 items-center justify-between px-5">
          <div className="flex items-center gap-2.5">
            <CompanyFinderMark className="size-7" />
            <span className="text-sm font-semibold tracking-tight">Company Finder</span>
          </div>
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
            className="h-10 w-full justify-start gap-3 rounded-xl px-3"
            variant="ghost"
            onClick={newChat}
            disabled={!ready}
          >
            <SquarePenIcon className="size-4" />
            New chat
          </Button>
        </div>
        <p className="text-muted-foreground px-6 pt-7 pb-2 text-xs font-medium">Your chats</p>
        <nav aria-label="Saved conversations" className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {loading && chats.length === 0 && <ChatHistoryLoading />}
          {!loading && ready && chats.length === 0 && (
            <p className="text-muted-foreground px-2 py-3 text-sm">
              Your conversations will appear here.
            </p>
          )}
          {chats.map((chat) => (
            <div
              key={chat.id}
              className={cn(
                "hover:bg-sidebar-accent flex items-center rounded-lg pr-1 transition-colors",
                activeId === chat.id && "bg-sidebar-accent font-medium",
              )}
            >
              <button
                type="button"
                title={chat.title}
                aria-current={activeId === chat.id ? "page" : undefined}
                aria-busy={openingId === chat.id}
                onClick={() => void openChat(chat.id)}
                disabled={deletingId === chat.id}
                className="focus-visible:ring-ring flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm focus-visible:ring-2"
              >
                {openingId === chat.id ? (
                  <LoaderCircleIcon
                    aria-hidden="true"
                    className="text-muted-foreground size-4 shrink-0 animate-spin motion-reduce:animate-none"
                  />
                ) : (
                  <MessageSquareIcon className="text-muted-foreground size-4 shrink-0" />
                )}
                <span className="truncate">{openingId === chat.id ? "Opening…" : chat.title}</span>
              </button>
              <Button
                variant="ghost"
                size="icon"
                title="Delete chat"
                aria-label={`Delete chat: ${chat.title}`}
                className="text-muted-foreground hover:text-destructive"
                disabled={!!deletingId}
                onClick={() => {
                  setDeleteError(undefined);
                  setChatToDelete(chat);
                }}
              >
                <Trash2Icon className="size-4" />
              </Button>
            </div>
          ))}
          {nextCursor && (
            <Button
              variant="ghost"
              className="mt-2 w-full"
              disabled={loading}
              onClick={() => void refresh(nextCursor)}
            >
              {loading && (
                <LoaderCircleIcon
                  aria-hidden="true"
                  className="size-4 animate-spin motion-reduce:animate-none"
                />
              )}
              {loading ? "Loading…" : "Load older chats"}
            </Button>
          )}
        </nav>
        <div className="mx-3 mb-3 flex items-center gap-2 rounded-xl px-2 py-3">
          <span className="bg-sidebar-accent flex size-8 shrink-0 items-center justify-center rounded-full">
            <CompanyFinderMark className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-medium">Your workspace</p>
            <p className="text-muted-foreground mt-0.5 text-[11px]">Chats saved in this browser</p>
          </div>
        </div>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between px-4 md:px-6">
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
            <span className="truncate text-sm font-medium text-muted-foreground">
              {chats.find((chat) => chat.id === activeId)?.title ?? "Company Finder"}
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
            <ChatSession key={sessionKey} saved={saved} onActivity={activity} onNewChat={newChat} />
          ) : loading ? (
            <WorkspaceLoading />
          ) : (
            <div className="text-muted-foreground flex h-full items-center justify-center px-6 text-center text-sm">
              Chat history is unavailable. Please retry to start chatting.
            </div>
          )}
        </div>
      </main>
      <Dialog
        open={chatToDelete !== null}
        onOpenChange={(open) => {
          if (!open && !deletingId) setChatToDelete(null);
        }}
      >
        <DialogContent showCloseButton={!deletingId}>
          <DialogHeader>
            <DialogTitle>Delete chat?</DialogTitle>
            <DialogDescription>
              This will permanently delete “{chatToDelete?.title}” and its messages.
            </DialogDescription>
          </DialogHeader>
          {deleteError && (
            <p role="alert" className="text-sm text-destructive">
              {deleteError}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" disabled={!!deletingId} onClick={() => setChatToDelete(null)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={!!deletingId} onClick={() => void removeChat()}>
              {deletingId && (
                <LoaderCircleIcon
                  aria-hidden="true"
                  className="size-4 animate-spin motion-reduce:animate-none"
                />
              )}
              {deletingId ? "Deleting…" : "Delete chat"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
