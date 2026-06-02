CREATE TYPE "public"."concurrency_mode" AS ENUM('concurrent', 'sequential');--> statement-breakpoint
ALTER TYPE "public"."heal_status" ADD VALUE 'pending' BEFORE 'healed';--> statement-breakpoint
ALTER TYPE "public"."issue_type" ADD VALUE 'MultiVolumeAttachment';--> statement-breakpoint
ALTER TABLE "clusters" ADD COLUMN "enabled_heal_rules" text[] DEFAULT ARRAY['CrashLoop','OOM','ImagePull','Pending','NodePressure','MultiVolumeAttachment']::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "clusters" ADD COLUMN "heal_rule_modes" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "clusters" ADD COLUMN "concurrency_mode" "concurrency_mode" DEFAULT 'concurrent' NOT NULL;