import os from "node:os";

import { loadEnv } from "./config/env.js";
import { buildServer } from "./server.js";

const env = loadEnv();
const { app } = await buildServer(env);

// Avoid Fastify calling os.networkInterfaces() when address lookup fails (some sandboxes/VMs).
const host = process.env.AGENT_HOST ?? "0.0.0.0";
try {
  os.networkInterfaces();
} catch {
  os.networkInterfaces = () => ({
    lo0: [{ address: "127.0.0.1", family: "IPv4", internal: true } as os.NetworkInterfaceInfo],
  });
}

try {
  await app.listen({ port: env.PORT, host });
  app.log.info(`agent listening on ${host}:${env.PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
