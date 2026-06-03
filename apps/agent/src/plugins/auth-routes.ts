import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { z } from "zod";

import type { Env } from "../config/env.js";
import type { Database } from "../db/client.js";
import { UserService } from "../services/users.js";

const loginSchema = z.object({
  emailOrUsername: z.string().min(1),
  password: z.string().min(1),
});

const oauthSchema = z.object({
  provider: z.enum(["google", "github"]),
  providerId: z.string().min(1),
  email: z.string().email(),
  name: z.string().min(1),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

function assertSyncSecret(
  request: { headers: Record<string, string | string[] | undefined> },
  secret: string,
): boolean {
  const header = request.headers["x-auth-sync-secret"];
  const value = Array.isArray(header) ? header[0] : header;
  return value === secret;
}

async function signUserToken(
  app: FastifyInstance,
  user: {
    id: string;
    email: string;
    role: string;
    mustChangePassword: boolean;
  },
): Promise<string> {
  return app.jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    },
    { expiresIn: "7d" },
  );
}

export const authRoutesPlugin: FastifyPluginAsync<{
  env: Env;
  db: Database;
}> = async (app, opts) => {
  const userService = new UserService(opts.db);

  app.get("/setup-status", async () => {
    const needsSetup = !(await userService.hasAdmin());
    return { needsSetup };
  });

  app.post("/bootstrap-admin", async (_request, reply) => {
    try {
      const creds = await userService.bootstrapAdmin();
      return creds;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to create admin";
      if (message.includes("already exists")) {
        return reply.code(409).send({ error: message });
      }
      return reply.code(400).send({ error: message });
    }
  });

  app.post("/login", async (request, reply) => {
    const body = loginSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: "Invalid credentials payload" });
    }

    const user = await userService.verifyCredentials(
      body.data.emailOrUsername,
      body.data.password,
    );

    if (!user) {
      return reply.code(401).send({ error: "Invalid email/username or password" });
    }

    const token = await signUserToken(app, {
      id: user.id,
      email: user.email,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    });

    return {
      token,
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    };
  });

  app.post("/oauth", async (request, reply) => {
    if (!assertSyncSecret(request, opts.env.JWT_SECRET)) {
      return reply.code(401).send({ error: "Unauthorized sync request" });
    }

    const body = oauthSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: "Invalid OAuth payload" });
    }

    try {
      const user = await userService.upsertOAuthUser({
        provider: body.data.provider,
        providerId: body.data.providerId,
        email: body.data.email,
        name: body.data.name,
      });

      const token = await signUserToken(app, {
        id: user.id,
        email: user.email,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
      });

      return {
        token,
        userId: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "OAuth login failed";
      return reply.code(403).send({ error: message });
    }
  });

  app.get(
    "/me",
    { preHandler: [app.authenticate] },
    async (request) => {
      const user = await userService.getById(request.user.userId);
      if (!user) {
        return { error: "User not found" };
      }

      return {
        id: user.id,
        email: user.email,
        username: user.username,
        name: user.name,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
        active: user.active,
        oauthProvider: user.oauthProvider,
      };
    },
  );

  app.post(
    "/change-password",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const body = changePasswordSchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ error: "Invalid password payload" });
      }

      try {
        await userService.changePassword(
          request.user.userId,
          body.data.currentPassword,
          body.data.newPassword,
        );
        const user = await userService.getById(request.user.userId);
        if (!user) {
          return reply.code(404).send({ error: "User not found" });
        }

        const token = await signUserToken(app, {
          id: user.id,
          email: user.email,
          role: user.role,
          mustChangePassword: user.mustChangePassword,
        });

        return { ok: true, token };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to change password";
        return reply.code(400).send({ error: message });
      }
    },
  );
};
