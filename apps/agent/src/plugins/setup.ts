import type { FastifyPluginAsync } from "fastify";
import type pg from "pg";

import type { Database } from "../db/client.js";
import {
  applyDatabaseSchema,
  checkDatabaseConnection,
  getSchemaStatus,
} from "../services/database-setup.js";
import { UserService } from "../services/users.js";

export const setupPlugin: FastifyPluginAsync<{
  db: Database;
  pool: pg.Pool;
}> = async (app, opts) => {
  const userService = new UserService(opts.db);

  app.get("/status", async () => {
    const dbConnection = await checkDatabaseConnection(opts.pool);
    const schema =
      dbConnection.ok
        ? await getSchemaStatus(opts.db, opts.pool)
        : { present: false, detail: "Database not connected" };
    const adminPresent = await userService.hasAdmin();
    const schemaReady = dbConnection.ok && schema.present;

    return {
      dbConnected: dbConnection.ok,
      dbDetail: dbConnection.detail,
      schemaPresent: schema.present,
      schemaDetail: schema.detail,
      adminPresent,
      /** Schema applied — user may proceed to admin credential setup on /login */
      readyForLogin: schemaReady,
      /** Full first-run setup finished (schema + admin account exist) */
      initialSetupComplete: schemaReady && adminPresent,
    };
  });

  app.post("/check-db", async () => {
    const result = await checkDatabaseConnection(opts.pool);
    return result;
  });

  app.post("/apply-schema", async () => {
    return applyDatabaseSchema(opts.pool, opts.db);
  });
};
