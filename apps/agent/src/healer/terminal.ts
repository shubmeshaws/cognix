import type { Database } from "../db/client.js";
import { terminalLines } from "../db/schema.js";
import type { ClusterWebSocketHub } from "../ws/cluster-hub.js";
import type { TerminalLevel } from "./types.js";

export class TerminalSession {
  private sequence = 0;

  constructor(
    private readonly db: Database,
    private readonly healRecordId: string,
    private readonly clusterId: string,
    private readonly clusterHub: ClusterWebSocketHub,
  ) {}

  async write(level: TerminalLevel, text: string): Promise<void> {
    this.sequence += 1;
    const ts = new Date();

    const [row] = await this.db
      .insert(terminalLines)
      .values({
        healRecordId: this.healRecordId,
        sequence: this.sequence,
        ts,
        level,
        text,
      })
      .returning({ id: terminalLines.id });

    this.clusterHub.broadcastToCluster(this.clusterId, {
      type: "terminal:line",
      healId: this.healRecordId,
      line: {
        id: row.id,
        sequence: this.sequence,
        level,
        text,
        ts: ts.toISOString(),
      },
    });
  }
}
