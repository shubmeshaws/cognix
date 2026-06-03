export function parseAllowedDomains(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return [
    ...new Set(
      raw
        .split(/[,;\s]+/)
        .map((part) => part.trim().toLowerCase().replace(/^@+/, ""))
        .filter(Boolean),
    ),
  ];
}

export function formatAllowedDomains(domains: string[] | undefined): string {
  return (domains ?? []).join(", ");
}

export function isEmailDomainAllowed(
  email: string,
  allowedDomains: string[] | undefined,
): boolean {
  if (!allowedDomains?.length) return true;
  const domain = email.split("@")[1]?.trim().toLowerCase();
  if (!domain) return false;
  return allowedDomains.some(
    (allowed) => domain === allowed || domain.endsWith(`.${allowed}`),
  );
}
