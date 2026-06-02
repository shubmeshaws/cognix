/** Case-insensitive duplicate check against connected cluster display names. */
export function clusterNameExists(
  clusters: { name: string }[],
  name: string,
): boolean {
  const want = name.trim().toLowerCase();
  if (!want) return false;
  return clusters.some((c) => c.name.trim().toLowerCase() === want);
}

export const DUPLICATE_CLUSTER_NAME_MESSAGE =
  "A cluster with this name is already connected. Remove it first or choose a different name.";
