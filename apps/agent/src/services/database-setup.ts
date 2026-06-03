import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type pg from "pg";

import type { Database } from "../db/client.js";

const REQUIRED_TABLES = [
  "users",
  "clusters",
  "heal_records",
  "alerts",
  "terminal_lines",
] as const;

const REQUIRED_USER_COLUMNS = [
  "password_hash",
  "role",
  "username",
  "must_change_password",
  "active",
  "oauth_provider",
  "oauth_provider_id",
  "updated_at",
] as const;

const MIGRATION_FILES = [
  "0000_wandering_wolfpack.sql",
  "0001_shallow_star_brand.sql",
  "0001_add_pending_heal_status.sql",
  "0002_add_heal_job_pods.sql",
  "0003_add_heal_worker_pods.sql",
] as const;

const AUTH_SCHEMA_SQL = `
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('admin', 'user');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE users ADD COLUMN IF NOT EXISTS username text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS role user_role NOT NULL DEFAULT 'user';
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS oauth_provider text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS oauth_provider_id text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique ON users (username) WHERE username IS NOT NULL;
`;

export interface DatabaseConnectionResult {
  ok: boolean;
  detail: string;
}

export interface SchemaStatusResult {
  present: boolean;
  detail: string;
}

export interface ApplySchemaResult {
  ok: boolean;
  alreadyPresent: boolean;
  detail: string;
}

export async function checkDatabaseConnection(
  pool: pg.Pool,
): Promise<DatabaseConnectionResult> {
  try {
    await pool.query("SELECT 1");
    return { ok: true, detail: "PostgreSQL connection successful" };
  } catch (err) {
    return {
      ok: false,
      detail:
        err instanceof Error ? err.message : "Cannot connect to PostgreSQL",
    };
  }
}

export async function getSchemaStatus(
  _db: Database,
  pool: pg.Pool,
): Promise<SchemaStatusResult> {
  try {
    for (const table of REQUIRED_TABLES) {
      const { rows } = await pool.query<{ present: boolean }>(
        `SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = $1
        ) AS present`,
        [table],
      );
      if (!rows[0]?.present) {
        return {
          present: false,
          detail: `Missing required table: ${table}`,
        };
      }
    }

    for (const column of REQUIRED_USER_COLUMNS) {
      const { rows } = await pool.query<{ present: boolean }>(
        `SELECT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'users'
            AND column_name = $1
        ) AS present`,
        [column],
      );
      if (!rows[0]?.present) {
        return {
          present: false,
          detail: `Missing required users column: ${column}`,
        };
      }
    }

    return {
      present: true,
      detail: "Database schema is present",
    };
  } catch (err) {
    return {
      present: false,
      detail: err instanceof Error ? err.message : "Failed to inspect schema",
    };
  }
}

async function runSqlFile(pool: pg.Pool, relativePath: string): Promise<void> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const filePath = path.join(here, "../../drizzle", relativePath);
  const contents = await readFile(filePath, "utf8");
  const statements = contents
    .split("--> statement-breakpoint")
    .map((part) => part.trim())
    .filter(Boolean);

  for (const statement of statements) {
    try {
      await pool.query(statement);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (
        message.includes("already exists") ||
        message.includes("duplicate key") ||
        message.includes("duplicate_object")
      ) {
        continue;
      }
      throw err;
    }
  }
}

export async function applyDatabaseSchema(
  pool: pg.Pool,
  db: Database,
): Promise<ApplySchemaResult> {
  const existing = await getSchemaStatus(db, pool);
  if (existing.present) {
    return {
      ok: true,
      alreadyPresent: true,
      detail: "Database schema is present",
    };
  }

  const connection = await checkDatabaseConnection(pool);
  if (!connection.ok) {
    return {
      ok: false,
      alreadyPresent: false,
      detail: connection.detail,
    };
  }

  try {
    for (const file of MIGRATION_FILES) {
      await runSqlFile(pool, file);
    }

    await pool.query(AUTH_SCHEMA_SQL);

    const after = await getSchemaStatus(db, pool);
    if (!after.present) {
      return {
        ok: false,
        alreadyPresent: false,
        detail: after.detail,
      };
    }

    return {
      ok: true,
      alreadyPresent: false,
      detail: "Database schema created successfully",
    };
  } catch (err) {
    return {
      ok: false,
      alreadyPresent: false,
      detail: err instanceof Error ? err.message : "Failed to apply schema",
    };
  }
}
