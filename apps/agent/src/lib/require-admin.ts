import type { FastifyReply, FastifyRequest } from "fastify";

import type { UserService } from "../services/users.js";

export async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
  userService: UserService,
): Promise<boolean> {
  await request.server.authenticate(request, reply);
  if (reply.sent) {
    return false;
  }

  const user = await userService.getById(request.user.userId);
  if (!user?.active || user.role !== "admin") {
    await reply.code(403).send({ error: "Admin access required" });
    return false;
  }

  return true;
}
