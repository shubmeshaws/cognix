ALTER TABLE "clusters" ADD COLUMN IF NOT EXISTS "heal_worker_pods" boolean DEFAULT true NOT NULL;
