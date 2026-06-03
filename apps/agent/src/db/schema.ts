import { relations, sql } from "drizzle-orm";
import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const issueTypeEnum = pgEnum("issue_type", [
  "CrashLoop",
  "OOM",
  "Pending",
  "ImagePull",
  "NodePressure",
  "MultiVolumeAttachment",
]);

export const severityEnum = pgEnum("severity", [
  "low",
  "medium",
  "high",
  "critical",
]);

export const healStatusEnum = pgEnum("heal_status", [
  "pending",
  "healed",
  "escalated",
  "failed",
  "skipped",
]);

export const terminalLevelEnum = pgEnum("terminal_level", [
  "info",
  "warn",
  "err",
  "ok",
  "cmd",
  "heal",
]);

export const concurrencyModeEnum = pgEnum("concurrency_mode", [
  "concurrent",
  "sequential",
]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const clusters = pgTable("clusters", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  kubeconfigEncrypted: text("kubeconfig_encrypted").notNull(),
  serverUrl: text("server_url").notNull(),
  contextName: text("context_name").notNull(),
  namespaceFilter: text("namespace_filter").array(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastConnectedAt: timestamp("last_connected_at", { withTimezone: true }),
  /** Heal rule ids enabled for this cluster (e.g. OOM, ImagePull). */
  enabledHealRules: text("enabled_heal_rules")
    .array()
    .notNull()
    .default(
      sql`ARRAY['CrashLoop','OOM','ImagePull','Pending','NodePressure','MultiVolumeAttachment']::text[]`,
    ),
  /** Per-rule auto vs approval (keys are HealRuleId). */
  healRuleModes: jsonb("heal_rule_modes")
    .notNull()
    .default({}),
  /** Concurrency mode for auto-heals across the cluster. */
  concurrencyMode: concurrencyModeEnum("concurrency_mode")
    .notNull()
    .default("concurrent"),
  /** When true, pod heal rules also apply to Job / CronJob / ScaledJob pods. */
  healJobPods: boolean("heal_job_pods").notNull().default(false),
  /** When true, pod heal rules also apply to worker Deployment pods. */
  healWorkerPods: boolean("heal_worker_pods").notNull().default(true),
});

export const healRecords = pgTable("heal_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  clusterId: uuid("cluster_id")
    .notNull()
    .references(() => clusters.id, { onDelete: "cascade" }),
  podName: text("pod_name").notNull(),
  namespace: text("namespace").notNull(),
  issueType: issueTypeEnum("issue_type").notNull(),
  severity: severityEnum("severity").notNull(),
  llmReasoning: text("llm_reasoning").notNull(),
  actionTaken: text("action_taken").notNull(),
  status: healStatusEnum("status").notNull(),
  durationMs: integer("duration_ms").notNull(),
  beforeState: jsonb("before_state").notNull(),
  afterState: jsonb("after_state").notNull(),
  approvedBy: uuid("approved_by").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const terminalLines = pgTable("terminal_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  healRecordId: uuid("heal_record_id")
    .notNull()
    .references(() => healRecords.id, { onDelete: "cascade" }),
  sequence: integer("sequence").notNull(),
  ts: timestamp("ts", { withTimezone: true }).notNull(),
  level: terminalLevelEnum("level").notNull(),
  text: text("text").notNull(),
});

export const alerts = pgTable("alerts", {
  id: uuid("id").primaryKey().defaultRandom(),
  clusterId: uuid("cluster_id")
    .notNull()
    .references(() => clusters.id, { onDelete: "cascade" }),
  podName: text("pod_name").notNull(),
  namespace: text("namespace").notNull(),
  message: text("message").notNull(),
  severity: severityEnum("severity").notNull(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  notifiedSlack: boolean("notified_slack").notNull().default(false),
  notifiedPagerduty: boolean("notified_pagerduty").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const usersRelations = relations(users, ({ many }) => ({
  clusters: many(clusters),
  approvedHealRecords: many(healRecords),
}));

export const clustersRelations = relations(clusters, ({ one, many }) => ({
  owner: one(users, {
    fields: [clusters.ownerId],
    references: [users.id],
  }),
  healRecords: many(healRecords),
  alerts: many(alerts),
}));

export const healRecordsRelations = relations(healRecords, ({ one, many }) => ({
  cluster: one(clusters, {
    fields: [healRecords.clusterId],
    references: [clusters.id],
  }),
  approver: one(users, {
    fields: [healRecords.approvedBy],
    references: [users.id],
  }),
  terminalLines: many(terminalLines),
}));

export const terminalLinesRelations = relations(terminalLines, ({ one }) => ({
  healRecord: one(healRecords, {
    fields: [terminalLines.healRecordId],
    references: [healRecords.id],
  }),
}));

export const alertsRelations = relations(alerts, ({ one }) => ({
  cluster: one(clusters, {
    fields: [alerts.clusterId],
    references: [clusters.id],
  }),
}));
