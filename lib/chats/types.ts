import type { MessageStreamEvent } from "eve/client";

export type ChatSummary = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type SavedChat = ChatSummary & {
  events: MessageStreamEvent[];
  streamIndex: number;
};
