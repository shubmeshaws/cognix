ALTER TABLE "clusters" ADD COLUMN IF NOT EXISTS "heal_job_pods" boolean DEFAULT false NOT NULL;
