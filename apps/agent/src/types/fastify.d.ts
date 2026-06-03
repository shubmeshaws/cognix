import "@fastify/jwt";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: {
      userId: string;
      email?: string;
      role?: string;
      mustChangePassword?: boolean;
    };
    user: {
      userId: string;
      email?: string;
      role?: string;
      mustChangePassword?: boolean;
    };
  }
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (
      request: FastifyRequest,
      reply: FastifyReply,
    ) => Promise<void>;
    deps: import("../context/deps.js").ServerDeps;
    clusterHub: import("../ws/cluster-hub.js").ClusterWebSocketHub;
    db: import("../db/client.js").Database;
  }
}

import type { FastifyReply, FastifyRequest } from "fastify";
