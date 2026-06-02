import { randomBytes } from "node:crypto";

import type { ConnectClusterResult } from "./clusters.js";

const TTL_MS = 30 * 60 * 1000;

export interface PendingRegistration {
  ownerId: string;
  clusterName: string;
  namespaceFilter?: string[];
  expiresAt: number;
  clusterId?: string;
  result?: ConnectClusterResult;
}

export class RegistrationService {
  private readonly pending = new Map<string, PendingRegistration>();

  create(input: {
    ownerId: string;
    clusterName: string;
    namespaceFilter?: string[];
  }): { token: string; expiresAt: string } {
    const token = randomBytes(24).toString("hex");
    const expiresAt = Date.now() + TTL_MS;
    this.pending.set(token, {
      ownerId: input.ownerId,
      clusterName: input.clusterName,
      namespaceFilter: input.namespaceFilter,
      expiresAt,
    });
    return { token, expiresAt: new Date(expiresAt).toISOString() };
  }

  get(token: string): PendingRegistration | undefined {
    const entry = this.pending.get(token);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.pending.delete(token);
      return undefined;
    }
    return entry;
  }

  complete(token: string, result: ConnectClusterResult): void {
    const entry = this.pending.get(token);
    if (!entry) return;
    entry.clusterId = result.clusterId;
    entry.result = result;
  }

  statusForOwner(
    token: string,
    ownerId: string,
  ):
    | { status: "pending" }
    | { status: "connected"; clusterId: string; result: ConnectClusterResult }
    | null {
    const entry = this.get(token);
    if (!entry || entry.ownerId !== ownerId) return null;
    if (entry.clusterId && entry.result) {
      return {
        status: "connected",
        clusterId: entry.clusterId,
        result: entry.result,
      };
    }
    return { status: "pending" };
  }

  consumeForAgent(token: string): PendingRegistration | null {
    const entry = this.get(token);
    if (!entry || entry.clusterId) return null;
    return entry;
  }
}

export const registrationService = new RegistrationService();
