import type { MessageStreamEvent } from "eve/client";

export class ChatEventDecoder {
  private decoder = new TextDecoder();
  private pending = "";

  push(chunk?: Uint8Array): MessageStreamEvent[] {
    this.pending += this.decoder.decode(chunk, { stream: chunk !== undefined });
    const lines = this.pending.split("\n");
    this.pending = chunk === undefined ? "" : lines.pop()!;
    return lines
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as MessageStreamEvent);
  }
}

export function isChatBoundary(event: MessageStreamEvent) {
  return [
    "session.waiting",
    "session.completed",
    "session.failed",
    "turn.completed",
    "turn.cancelled",
    "turn.failed",
    "input.requested",
  ].includes(event.type);
}
