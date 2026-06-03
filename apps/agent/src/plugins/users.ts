import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import type { Database } from "../db/client.js";
import { isProtectedOwner } from "../lib/protected-owner.js";
import { requireAdmin } from "../lib/require-admin.js";
import { UserService } from "../services/users.js";

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(128),
  username: z.string().min(2).max(64).optional(),
  role: z.enum(["admin", "user"]).optional(),
});

const updateUserSchema = z.object({
  name: z.string().min(1).max(128).optional(),
  username: z.string().min(2).max(64).nullable().optional(),
  role: z.enum(["admin", "user"]).optional(),
  active: z.boolean().optional(),
});

export const usersPlugin: FastifyPluginAsync<{ db: Database }> = async (
  app,
  opts,
) => {
  const userService = new UserService(opts.db);

  app.addHook("preHandler", async (request, reply) => {
    const ok = await requireAdmin(request, reply, userService);
    if (!ok) {
      return reply;
    }
  });

  app.get("/", async () => {
    const users = await userService.list();
    return { users };
  });

  app.post("/", async (request, reply) => {
    const body = createUserSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: "Invalid user payload" });
    }

    try {
      const { user, temporaryPassword } = await userService.createUser(body.data);
      return { user, temporaryPassword };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create user";
      return reply.code(400).send({ error: message });
    }
  });

  app.patch("/:id", async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    const body = updateUserSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.code(400).send({ error: "Invalid update payload" });
    }

    if (
      params.data.id === request.user.userId &&
      body.data.active === false
    ) {
      return reply.code(400).send({ error: "You cannot disable your own account" });
    }

    const existing = await userService.getById(params.data.id);
    if (!existing) {
      return reply.code(404).send({ error: "User not found" });
    }
    if (isProtectedOwner(existing)) {
      return reply
        .code(400)
        .send({ error: "The primary admin account cannot be modified" });
    }

    try {
      const user = await userService.updateUser(params.data.id, body.data);
      if (!user) {
        return reply.code(404).send({ error: "User not found" });
      }
      return { user };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update user";
      return reply.code(400).send({ error: message });
    }
  });

  app.delete("/:id", async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: "Invalid user id" });
    }

    if (params.data.id === request.user.userId) {
      return reply.code(400).send({ error: "You cannot delete your own account" });
    }

    const existing = await userService.getById(params.data.id);
    if (!existing) {
      return reply.code(404).send({ error: "User not found" });
    }
    if (isProtectedOwner(existing)) {
      return reply
        .code(400)
        .send({ error: "The primary admin account cannot be deleted" });
    }

    try {
      await userService.deleteUser(params.data.id);
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete user";
      return reply.code(400).send({ error: message });
    }
  });

  app.post("/:id/reset-password", async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: "Invalid user id" });
    }

    const existing = await userService.getById(params.data.id);
    if (!existing) {
      return reply.code(404).send({ error: "User not found" });
    }
    if (isProtectedOwner(existing)) {
      return reply
        .code(400)
        .send({
          error: "The primary admin password cannot be reset from the admin panel",
        });
    }

    try {
      const temporaryPassword = await userService.resetPassword(params.data.id);
      return { temporaryPassword };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to reset password";
      return reply.code(400).send({ error: message });
    }
  });
};
