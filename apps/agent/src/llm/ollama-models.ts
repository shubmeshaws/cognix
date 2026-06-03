export interface OllamaTagsResponse {
  models?: { name: string }[];
}

export function ollamaModelMatches(
  models: { name: string }[] | undefined,
  model: string,
): boolean {
  if (!models?.length) return false;
  const want = model.trim();
  return models.some((entry) => {
    const name = entry.name;
    return (
      name === want ||
      name.startsWith(`${want}:`) ||
      name.split(":")[0] === want.split(":")[0]
    );
  });
}

/** Pick preferred model if present, otherwise the first installed model. */
export function resolveOllamaModel(
  models: { name: string }[] | undefined,
  preferred: string,
): { model: string; autoSelected: boolean } {
  const pref = preferred.trim();
  if (ollamaModelMatches(models, pref)) {
    return { model: pref, autoSelected: false };
  }
  const first = models?.[0]?.name?.trim();
  if (first) {
    return { model: first, autoSelected: true };
  }
  return { model: pref, autoSelected: false };
}

export async function fetchOllamaTags(
  baseUrl: string,
  timeoutMs = 5_000,
): Promise<OllamaTagsResponse> {
  const res = await fetch(new URL("/api/tags", baseUrl).toString(), {
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    throw new Error(`Ollama returned ${res.status}`);
  }
  return (await res.json()) as OllamaTagsResponse;
}

const TAGS_CACHE_MS = 30_000;
let tagsCache: {
  baseUrl: string;
  tags: OllamaTagsResponse;
  fetchedAt: number;
} | null = null;

export async function getCachedOllamaTags(
  baseUrl: string,
): Promise<OllamaTagsResponse> {
  const now = Date.now();
  if (
    tagsCache &&
    tagsCache.baseUrl === baseUrl &&
    now - tagsCache.fetchedAt < TAGS_CACHE_MS
  ) {
    return tagsCache.tags;
  }
  const tags = await fetchOllamaTags(baseUrl);
  tagsCache = { baseUrl, tags, fetchedAt: now };
  return tags;
}

/** Resolve configured model to an installed Ollama model before chat/generate calls. */
export async function resolveOllamaModelForRequest(
  baseUrl: string,
  preferred: string,
): Promise<{ model: string; autoSelected: boolean }> {
  const tags = await getCachedOllamaTags(baseUrl);
  return resolveOllamaModel(tags.models, preferred);
}
