import { and, eq, ne, or, sql } from "drizzle-orm";

import type { Database } from "../db/client.js";
import { clusters, users } from "../db/schema.js";
import { isProtectedOwner, PROTECTED_OWNER_EMAIL } from "../lib/protected-owner.js";
import {
  generateRandomPassword,
  hashPassword,
  validatePasswordStrength,
  verifyPassword,
} from "../lib/password.js";

export type UserRole = "admin" | "user";

export interface UserRecord {
  id: string;
  email: string;
  username: string | null;
  name: string;
  passwordHash: string | null;
  role: UserRole;
  mustChangePassword: boolean;
  active: boolean;
  oauthProvider: string | null;
  oauthProviderId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicUser {
  id: string;
  email: string;
  username: string | null;
  name: string;
  role: UserRole;
  mustChangePassword: boolean;
  active: boolean;
  hasPassword: boolean;
  oauthProvider: string | null;
  createdAt: string;
}

function toPublicUser(row: typeof users.$inferSelect): PublicUser {
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    name: row.name,
    role: row.role,
    mustChangePassword: row.mustChangePassword,
    active: row.active,
    hasPassword: Boolean(row.passwordHash),
    oauthProvider: row.oauthProvider,
    createdAt: row.createdAt.toISOString(),
  };
}

export class UserService {
  constructor(private readonly db: Database) {}

  async getById(id: string): Promise<UserRecord | null> {
    const [row] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    return row ?? null;
  }

  async list(): Promise<PublicUser[]> {
    const rows = await this.db.select().from(users).orderBy(users.createdAt);
    return rows.map(toPublicUser);
  }

  async hasAdmin(): Promise<boolean> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(eq(users.role, "admin"));
    return (row?.count ?? 0) > 0;
  }

  async bootstrapAdmin(): Promise<{
    email: string;
    username: string;
    password: string;
    name: string;
  }> {
    if (await this.hasAdmin()) {
      throw new Error("An admin account already exists");
    }

    const password = generateRandomPassword(16);
    const { user } = await this.createAdmin({
      email: "shubham.meshram@cognix.com",
      name: "Shubham Meshram",
      username: "shubham.meshram",
      password,
      mustChangePassword: true,
    });

    return {
      email: user.email,
      username: user.username ?? "shubham.meshram",
      password,
      name: user.name,
    };
  }

  async findByEmailOrUsername(identifier: string): Promise<UserRecord | null> {
    const key = identifier.trim().toLowerCase();
    const [row] = await this.db
      .select()
      .from(users)
      .where(
        or(
          eq(users.email, key),
          eq(users.username, key),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async verifyCredentials(
    identifier: string,
    password: string,
  ): Promise<UserRecord | null> {
    const user = await this.findByEmailOrUsername(identifier);
    if (!user?.active || !user.passwordHash) {
      return null;
    }
    const ok = await verifyPassword(password, user.passwordHash);
    return ok ? user : null;
  }

  async createAdmin(input: {
    email: string;
    name: string;
    username?: string;
    password: string;
    mustChangePassword?: boolean;
  }): Promise<{ user: PublicUser; plainPassword: string }> {
    const strength = validatePasswordStrength(input.password);
    if (strength) {
      throw new Error(strength);
    }

    const passwordHash = await hashPassword(input.password);
    const [row] = await this.db
      .insert(users)
      .values({
        email: input.email.trim().toLowerCase(),
        username: input.username?.trim().toLowerCase() ?? null,
        name: input.name.trim(),
        passwordHash,
        role: "admin",
        mustChangePassword: input.mustChangePassword ?? true,
        active: true,
      })
      .returning();

    if (!row) {
      throw new Error("Failed to create admin user");
    }

    return { user: toPublicUser(row), plainPassword: input.password };
  }

  async createUser(input: {
    email: string;
    name: string;
    username?: string;
    role?: UserRole;
  }): Promise<{ user: PublicUser; temporaryPassword: string }> {
    const temporaryPassword = generateRandomPassword();
    const passwordHash = await hashPassword(temporaryPassword);

    const [row] = await this.db
      .insert(users)
      .values({
        email: input.email.trim().toLowerCase(),
        username: input.username?.trim().toLowerCase() ?? null,
        name: input.name.trim(),
        passwordHash,
        role: input.role ?? "user",
        mustChangePassword: true,
        active: true,
      })
      .returning();

    if (!row) {
      throw new Error("Failed to create user");
    }

    return { user: toPublicUser(row), temporaryPassword };
  }

  async upsertOAuthUser(input: {
    provider: string;
    providerId: string;
    email: string;
    name: string;
  }): Promise<UserRecord> {
    const email = input.email.trim().toLowerCase();
    const [existingByOAuth] = await this.db
      .select()
      .from(users)
      .where(
        and(
          eq(users.oauthProvider, input.provider),
          eq(users.oauthProviderId, input.providerId),
        ),
      )
      .limit(1);

    if (existingByOAuth) {
      if (!existingByOAuth.active) {
        throw new Error("Account is disabled");
      }
      const [updated] = await this.db
        .update(users)
        .set({
          email,
          name: input.name.trim() || existingByOAuth.name,
          updatedAt: new Date(),
        })
        .where(eq(users.id, existingByOAuth.id))
        .returning();
      return updated ?? existingByOAuth;
    }

    const [existingByEmail] = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existingByEmail) {
      if (!existingByEmail.active) {
        throw new Error("Account is disabled");
      }
      const [linked] = await this.db
        .update(users)
        .set({
          oauthProvider: input.provider,
          oauthProviderId: input.providerId,
          name: input.name.trim() || existingByEmail.name,
          updatedAt: new Date(),
        })
        .where(eq(users.id, existingByEmail.id))
        .returning();
      return linked ?? existingByEmail;
    }

    const [created] = await this.db
      .insert(users)
      .values({
        email,
        name: input.name.trim() || email.split("@")[0] || "User",
        role: "user",
        mustChangePassword: false,
        active: true,
        oauthProvider: input.provider,
        oauthProviderId: input.providerId,
      })
      .returning();

    if (!created) {
      throw new Error("Failed to create OAuth user");
    }
    return created;
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const strength = validatePasswordStrength(newPassword);
    if (strength) {
      throw new Error(strength);
    }

    const user = await this.getById(userId);
    if (!user?.active || !user.passwordHash) {
      throw new Error("Password login is not enabled for this account");
    }

    const ok = await verifyPassword(currentPassword, user.passwordHash);
    if (!ok) {
      throw new Error("Current password is incorrect");
    }

    const passwordHash = await hashPassword(newPassword);
    await this.db
      .update(users)
      .set({
        passwordHash,
        mustChangePassword: false,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  }

  async resetPassword(userId: string): Promise<string> {
    const user = await this.getById(userId);
    if (!user) {
      throw new Error("User not found");
    }
    if (isProtectedOwner(user)) {
      throw new Error("The primary admin password cannot be reset from the admin panel");
    }

    const temporaryPassword = generateRandomPassword();
    const passwordHash = await hashPassword(temporaryPassword);
    await this.db
      .update(users)
      .set({
        passwordHash,
        mustChangePassword: true,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
    return temporaryPassword;
  }

  async updateUser(
    userId: string,
    patch: {
      name?: string;
      role?: UserRole;
      active?: boolean;
      username?: string | null;
    },
  ): Promise<PublicUser | null> {
    const existing = await this.getById(userId);
    if (!existing) {
      return null;
    }
    if (isProtectedOwner(existing)) {
      throw new Error("The primary admin account cannot be modified");
    }

    const [row] = await this.db
      .update(users)
      .set({
        ...patch,
        username:
          patch.username === undefined
            ? undefined
            : patch.username?.trim().toLowerCase() ?? null,
        name: patch.name?.trim(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();
    return row ? toPublicUser(row) : null;
  }

  async deleteUser(userId: string): Promise<void> {
    const user = await this.getById(userId);
    if (!user) {
      throw new Error("User not found");
    }
    if (isProtectedOwner(user)) {
      throw new Error("The primary admin account cannot be deleted");
    }

    const [fallbackOwner] = await this.db
      .select()
      .from(users)
      .where(eq(users.email, PROTECTED_OWNER_EMAIL.toLowerCase()))
      .limit(1);

    let reassignTo = fallbackOwner?.id ?? null;
    if (!reassignTo || reassignTo === userId) {
      const [otherAdmin] = await this.db
        .select()
        .from(users)
        .where(and(eq(users.role, "admin"), ne(users.id, userId)))
        .limit(1);
      reassignTo = otherAdmin?.id ?? null;
    }

    if (reassignTo) {
      await this.db
        .update(clusters)
        .set({ ownerId: reassignTo })
        .where(eq(clusters.ownerId, userId));
    }

    await this.db.delete(users).where(eq(users.id, userId));
  }
}
