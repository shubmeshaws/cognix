import jwt from "@fastify/jwt";
import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";

import type { Env } from "../config/env.js";
import { normalizeUserId } from "../lib/user-id.js";

const authPluginImpl: FastifyPluginAsync<{ env: Env }> = async (app, opts) => {
  await app.register(jwt, {
    secret: opts.env.JWT_SECRET,
  });

  app.decorate(
    "authenticate",
    async function authenticate(request, reply): Promise<void> {
      try {
        await request.jwtVerify();
        request.user.userId = normalizeUserId(request.user.userId);
      } catch {
        return reply.code(401).send({ error: "Unauthorized" });
      }
    },
  );
};

/** Exposed globally so route plugins can use app.authenticate */
export const authPlugin = fp(authPluginImpl, { name: "auth" });
