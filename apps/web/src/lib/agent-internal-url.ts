/**
 * Agent URL for server-side calls (setup proxy, RSC).
 * Always use loopback on the same host — do not use NEXT_PUBLIC_API_URL here:
 * on EC2, fetching the instance public IP from itself often fails (hairpin).
 */
export function getAgentInternalBaseUrl(): string {
  const raw =
    process.env.AGENT_INTERNAL_URL?.trim() || "http://127.0.0.1:3001";
  return raw.replace(/\/$/, "");
}
