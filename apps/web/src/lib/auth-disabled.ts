/** When true, dashboard is open without NextAuth sign-in (local dev only). */
export function isAuthDisabled(): boolean {
  return process.env.NEXT_PUBLIC_AUTH_DISABLED === "true";
}
