import { and, desc, eq, sql } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import type { ServerDeps } from "../context/deps.js";
import { healRecords, terminalLines } from "../db/schema.js";
import { ClusterNotFoundError } from "../errors/cluster.js";
import { healListMeta, healNeedsApproval } from "../healer/heal-meta.js";
import { memoryApprovalFromBeforeState } from "../healer/oom-snapshot.js";
import { mapHealRecord } from "../healer/orchestrator.js";
import { getClusterConnection, verifyClusterOwnership } from "../services/cluster-connection.js";
import { notifyHealCompleted } from "../services/heal-notifications.js";

export const healsPlugin: FastifyPluginAsync<{ deps: ServerDeps }> = async (
  app,
  opts,
) => {
  app.addHook("onRequest", app.authenticate);

  app.get("/", async (request, reply) => {
    const query = z
      .object({
        clusterId: z.string().uuid(),
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(20),
      })
      .safeParse(request.query);

    if (!query.success) {
      return reply.code(400).send({ error: query.error.flatten() });
    }

    try {
      await verifyClusterOwnership(
        opts.deps.db,
        query.data.clusterId,
        request.user.userId,
      );

      const offset = (query.data.page - 1) * query.data.pageSize;

      const [countRow] = await opts.deps.db
        .select({ count: sql<number>`count(*)::int` })
        .from(healRecords)
        .where(eq(healRecords.clusterId, query.data.clusterId));

      const rows = await opts.deps.db
        .select()
        .from(healRecords)
        .where(eq(healRecords.clusterId, query.data.clusterId))
        .orderBy(desc(healRecords.createdAt))
        .limit(query.data.pageSize)
        .offset(offset);

      return {
        page: query.data.page,
        pageSize: query.data.pageSize,
        total: countRow?.count ?? 0,
        items: rows.map((row) => {
          const meta = healListMeta(row);
          return {
            id: row.id,
            clusterId: row.clusterId,
            podName: row.podName,
            namespace: row.namespace,
            issueType: row.issueType,
            severity: row.severity,
            actionTaken: row.actionTaken,
            status: row.status,
            durationMs: row.durationMs,
            approvedBy: row.approvedBy,
            createdAt: row.createdAt.toISOString(),
            deploymentName: meta.deploymentName,
            rolloutComplete: meta.rolloutComplete,
            memoryPatched: meta.memoryPatched,
            needsApproval: healNeedsApproval(row, opts.deps.watcher.isApprovalRequiredForCluster(row.clusterId, row.issueType as any)),
          };
        }),
      };
    } catch (err) {
      if (err instanceof ClusterNotFoundError) {
        return reply.code(404).send({ error: err.message });
      }
      throw err;
    }
  });

  app.get("/pending-approvals", async (request, reply) => {
    const query = z
      .object({
        clusterId: z.string().uuid(),
      })
      .safeParse(request.query);

    if (!query.success) {
      return reply.code(400).send({ error: query.error.flatten() });
    }

    try {
      await verifyClusterOwnership(
        opts.deps.db,
        query.data.clusterId,
        request.user.userId,
      );

      const rows = await opts.deps.db
        .select()
        .from(healRecords)
        .where(
          and(
            eq(healRecords.clusterId, query.data.clusterId),
            eq(healRecords.status, "pending"),
          ),
        )
        .orderBy(desc(healRecords.createdAt));

      const items = rows
        .filter((row) => healNeedsApproval(row, opts.deps.watcher.isApprovalRequiredForCluster(row.clusterId, row.issueType as any)))
        .map((row) => ({
          healId: row.id,
          podName: row.podName,
          namespace: row.namespace,
          issue: row.issueType,
          action: row.actionTaken,
          reasoning: row.llmReasoning ?? "",
          severity: row.severity,
          createdAt: row.createdAt.toISOString(),
          memory: memoryApprovalFromBeforeState(row.beforeState),
        }));

      return { items };
    } catch (err) {
      if (err instanceof ClusterNotFoundError) {
        return reply.code(404).send({ error: err.message });
      }
      throw err;
    }
  });

  app.get("/terminal/live", async (request, reply) => {
    const query = z
      .object({
        clusterId: z.string().uuid(),
        limit: z.coerce.number().int().min(1).max(500).default(500),
      })
      .safeParse(request.query);

    if (!query.success) {
      return reply.code(400).send({ error: query.error.flatten() });
    }

    try {
      await verifyClusterOwnership(
        opts.deps.db,
        query.data.clusterId,
        request.user.userId,
      );

      const rows = await opts.deps.db
        .select({
          id: terminalLines.id,
          healId: terminalLines.healRecordId,
          clusterId: healRecords.clusterId,
          sequence: terminalLines.sequence,
          level: terminalLines.level,
          text: terminalLines.text,
          ts: terminalLines.ts,
        })
        .from(terminalLines)
        .innerJoin(
          healRecords,
          eq(terminalLines.healRecordId, healRecords.id),
        )
        .where(eq(healRecords.clusterId, query.data.clusterId))
        .orderBy(desc(terminalLines.ts))
        .limit(query.data.limit);

      rows.reverse();

      return {
        lines: rows.map((row) => ({
          id: row.id,
          healId: row.healId,
          clusterId: row.clusterId,
          sequence: row.sequence,
          level: row.level,
          text: row.text,
          ts: row.ts.toISOString(),
        })),
      };
    } catch (err) {
      if (err instanceof ClusterNotFoundError) {
        return reply.code(404).send({ error: err.message });
      }
      throw err;
    }
  });

  app.get("/:id/terminal", async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);

    if (!params.success) {
      return reply.code(400).send({ error: "Invalid heal id" });
    }

    const [heal] = await opts.deps.db
      .select()
      .from(healRecords)
      .where(eq(healRecords.id, params.data.id))
      .limit(1);

    if (!heal) {
      return reply.code(404).send({ error: "Heal record not found" });
    }

    try {
      await verifyClusterOwnership(
        opts.deps.db,
        heal.clusterId,
        request.user.userId,
      );
    } catch (err) {
      if (err instanceof ClusterNotFoundError) {
        return reply.code(404).send({ error: err.message });
      }
      throw err;
    }

    const lines = await opts.deps.db
      .select()
      .from(terminalLines)
      .where(eq(terminalLines.healRecordId, params.data.id))
      .orderBy(terminalLines.sequence);

    return {
      healId: params.data.id,
      lines: lines.map((line) => ({
        id: line.id,
        sequence: line.sequence,
        level: line.level,
        text: line.text,
        ts: line.ts.toISOString(),
      })),
    };
  });

  app.post("/:id/approve", async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);

    if (!params.success) {
      return reply.code(400).send({ error: "Invalid heal id" });
    }

    const [heal] = await opts.deps.db
      .select()
      .from(healRecords)
      .where(eq(healRecords.id, params.data.id))
      .limit(1);

    if (!heal) {
      return reply.code(404).send({ error: "Heal record not found" });
    }

    if (heal.status !== "pending") {
      return reply.code(409).send({ error: "Heal is not pending approval" });
    }

    try {
      await verifyClusterOwnership(
        opts.deps.db,
        heal.clusterId,
        request.user.userId,
      );

      const record = mapHealRecord(heal);
      const mergedBefore = {
        ...record.beforeState,
        safeToAutoHeal: true,
        approvalRequired: false,
      };
      record.beforeState = mergedBefore;
      record.approvedBy = request.user.userId;

      await opts.deps.db
        .update(healRecords)
        .set({
          approvedBy: request.user.userId,
          beforeState: mergedBefore as Record<string, unknown>,
          afterState: {
            ...((heal.afterState as Record<string, unknown>) ?? {}),
            approvalRequired: false,
            audit: {
              action: "approved",
              actorId: request.user.userId,
              timestamp: new Date().toISOString(),
            },
          },
        })
        .where(eq(healRecords.id, params.data.id));

      const connection = await getClusterConnection(
        opts.deps.db,
        opts.deps.env,
        heal.clusterId,
        request.user.userId,
        opts.deps.watcher,
      );

      opts.deps.clusterHub.broadcastToCluster(heal.clusterId, {
        type: "heal:start",
        healId: heal.id,
        podName: heal.podName,
        namespace: heal.namespace,
        issue: heal.issueType,
        action: heal.actionTaken,
        severity: heal.severity,
      });

      const result = await opts.deps.orchestrator.execute(record, connection);

      opts.deps.clusterHub.broadcastToCluster(heal.clusterId, {
        type: "heal:complete",
        healId: result.healRecord.id,
        status: result.status,
        durationMs: result.healRecord.durationMs,
        podName: result.healRecord.podName,
        namespace: result.healRecord.namespace,
        issue: result.healRecord.issueType,
        action: result.healRecord.actionTaken,
        severity: result.healRecord.severity,
      });

      await notifyHealCompleted(opts.deps, result.healRecord, app.log);

      return { heal: result.healRecord, status: result.status };
    } catch (err) {
      if (err instanceof ClusterNotFoundError) {
        return reply.code(404).send({ error: err.message });
      }
      throw err;
    }
  });

  app.post("/:id/reject", async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);

    if (!params.success) {
      return reply.code(400).send({ error: "Invalid heal id" });
    }

    const [heal] = await opts.deps.db
      .select()
      .from(healRecords)
      .where(eq(healRecords.id, params.data.id))
      .limit(1);

    if (!heal) {
      return reply.code(404).send({ error: "Heal record not found" });
    }

    if (heal.status !== "pending") {
      return reply.code(409).send({ error: "Heal is not pending" });
    }

    try {
      await verifyClusterOwnership(
        opts.deps.db,
        heal.clusterId,
        request.user.userId,
      );

      const rejectedAt = new Date().toISOString();
      const [updated] = await opts.deps.db
        .update(healRecords)
        .set({
          status: "skipped",
          approvedBy: request.user.userId,
          afterState: {
            rejected: true,
            rejectedBy: request.user.userId,
            audit: {
              action: "rejected",
              actorId: request.user.userId,
              timestamp: rejectedAt,
            },
          },
        })
        .where(eq(healRecords.id, params.data.id))
        .returning();

      opts.deps.clusterHub.broadcastToCluster(heal.clusterId, {
        type: "heal:complete",
        healId: heal.id,
        status: "skipped",
        durationMs: updated.durationMs,
        podName: heal.podName,
        namespace: heal.namespace,
        issue: heal.issueType,
        action: updated.actionTaken,
        severity: heal.severity,
      });

      return { heal: mapHealRecord(updated), status: "skipped" };
    } catch (err) {
      if (err instanceof ClusterNotFoundError) {
        return reply.code(404).send({ error: err.message });
      }
      throw err;
    }
  });
};
