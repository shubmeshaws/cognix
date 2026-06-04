import { getAgentInternalBaseUrl } from "@/lib/agent-internal-url";

/** Browser: same-origin proxy. Server: loopback to agent on this host. */
export function getAgentApiBase(): string {
  if (typeof window !== "undefined") {
    return "/api/agent";
  }
  return `${getAgentInternalBaseUrl()}/api`;
}
