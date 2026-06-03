#!/usr/bin/env tsx
/**
 * Create the initial Cognix admin user.
 *
 * Usage:
 *   pnpm create-admin -- --email admin@example.com --name "Admin User" [--username admin]
 *
 * Prints a randomly generated password. User must change it on first login.
 */
import { parseArgs } from "node:util";

import { loadEnv } from "../src/config/env.js";
import { createDb } from "../src/db/client.js";
import { generateRandomPassword } from "../src/lib/password.js";
import { UserService } from "../src/services/users.js";

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      email: { type: "string" },
      name: { type: "string" },
      username: { type: "string" },
    },
  });

  const email = values.email?.trim();
  const name = values.name?.trim();
  const username = values.username?.trim();

  if (!email || !name) {
    console.error(
      "Usage: pnpm create-admin -- --email admin@example.com --name \"Admin User\" [--username admin]",
    );
    process.exit(1);
  }

  const env = loadEnv();
  const { db, pool } = createDb(env.DATABASE_URL);
  const userService = new UserService(db);

  const password = generateRandomPassword(16);

  try {
    const { user } = await userService.createAdmin({
      email,
      name,
      username,
      password,
      mustChangePassword: true,
    });

    console.log("\nCognix admin user created successfully.\n");
    console.log(`  Email:    ${user.email}`);
    if (user.username) {
      console.log(`  Username: ${user.username}`);
    }
    console.log(`  Role:     ${user.role}`);
    console.log(`  Password: ${password}`);
    console.log("\nSave this password — it will not be shown again.");
    console.log("The user must change it on first login.\n");
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

void main();
