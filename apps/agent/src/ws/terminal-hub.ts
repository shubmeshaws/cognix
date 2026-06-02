import type { TerminalLineEvent } from "../healer/types.js";

/** Minimal WebSocket surface used by @fastify/websocket */
export interface TerminalSocket {
  readonly readyState: number;
  send(data: string): void;
  on(event: "close" | "error", listener: () => void): void;
}

const OPEN = 1;

export class TerminalHub {
  private readonly clients = new Set<TerminalSocket>();

  subscribe(socket: TerminalSocket): void {
    this.clients.add(socket);
    socket.on("close", () => this.clients.delete(socket));
    socket.on("error", () => this.clients.delete(socket));
  }

  broadcast(event: TerminalLineEvent): void {
    const payload = JSON.stringify(event);
    for (const client of this.clients) {
      if (client.readyState === OPEN) {
        client.send(payload);
      }
    }
  }

  get subscriberCount(): number {
    return this.clients.size;
  }
}
