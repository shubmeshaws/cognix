CREATE TYPE "public"."heal_status" AS ENUM('healed', 'escalated', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."issue_type" AS ENUM('CrashLoop', 'OOM', 'Pending', 'ImagePull', 'NodePressure');--> statement-breakpoint
CREATE TYPE "public"."severity" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."terminal_level" AS ENUM('info', 'warn', 'err', 'ok', 'cmd', 'heal');--> statement-breakpoint
CREATE TABLE "alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cluster_id" uuid NOT NULL,
	"pod_name" text NOT NULL,
	"namespace" text NOT NULL,
	"message" text NOT NULL,
	"severity" "severity" NOT NULL,
	"resolved_at" timestamp with time zone,
	"notified_slack" boolean DEFAULT false NOT NULL,
	"notified_pagerduty" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clusters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kubeconfig_encrypted" text NOT NULL,
	"server_url" text NOT NULL,
	"context_name" text NOT NULL,
	"namespace_filter" text[],
	"owner_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_connected_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "heal_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cluster_id" uuid NOT NULL,
	"pod_name" text NOT NULL,
	"namespace" text NOT NULL,
	"issue_type" "issue_type" NOT NULL,
	"severity" "severity" NOT NULL,
	"llm_reasoning" text NOT NULL,
	"action_taken" text NOT NULL,
	"status" "heal_status" NOT NULL,
	"duration_ms" integer NOT NULL,
	"before_state" jsonb NOT NULL,
	"after_state" jsonb NOT NULL,
	"approved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "terminal_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"heal_record_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"ts" timestamp with time zone NOT NULL,
	"level" "terminal_level" NOT NULL,
	"text" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_cluster_id_clusters_id_fk" FOREIGN KEY ("cluster_id") REFERENCES "public"."clusters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clusters" ADD CONSTRAINT "clusters_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "heal_records" ADD CONSTRAINT "heal_records_cluster_id_clusters_id_fk" FOREIGN KEY ("cluster_id") REFERENCES "public"."clusters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "heal_records" ADD CONSTRAINT "heal_records_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terminal_lines" ADD CONSTRAINT "terminal_lines_heal_record_id_heal_records_id_fk" FOREIGN KEY ("heal_record_id") REFERENCES "public"."heal_records"("id") ON DELETE cascade ON UPDATE no action;