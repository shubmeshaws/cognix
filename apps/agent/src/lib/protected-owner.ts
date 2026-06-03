export const PROTECTED_OWNER_EMAIL = "shubham.meshram@cognix.com";
export const PROTECTED_OWNER_USERNAME = "shubham.meshram";

export function isProtectedOwner(user: {
  email: string;
  username?: string | null;
}): boolean {
  const email = user.email.trim().toLowerCase();
  const username = user.username?.trim().toLowerCase();
  return (
    email === PROTECTED_OWNER_EMAIL.toLowerCase() ||
    username === PROTECTED_OWNER_USERNAME.toLowerCase()
  );
}
