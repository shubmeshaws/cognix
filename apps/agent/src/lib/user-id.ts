/** Stable owner id for auth-disabled local dev (matches users.id / owner_id UUID columns). */
export const DEV_USER_ID = "00000000-0000-4000-8000-000000000001";

const LEGACY_DEV_USER_ID = "dev-user";

export function normalizeUserId(userId: string): string {
  if (userId === LEGACY_DEV_USER_ID) return DEV_USER_ID;
  return userId;
}
