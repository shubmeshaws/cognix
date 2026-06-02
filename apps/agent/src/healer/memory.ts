const UNITS: Record<string, number> = {
  Ei: 1024 ** 6,
  Pi: 1024 ** 5,
  Ti: 1024 ** 4,
  Gi: 1024 ** 3,
  Mi: 1024 ** 2,
  Ki: 1024,
};

export function parseMemoryToBytes(value: string): number {
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d+(?:\.\d+)?)([A-Za-z]+)?$/);
  if (!match) return 0;

  const amount = Number.parseFloat(match[1]);
  const unit = match[2] ?? "";

  if (unit.endsWith("i") || unit in UNITS) {
    const mult = UNITS[unit] ?? 1;
    return Math.floor(amount * mult);
  }

  if (unit === "m") {
    return Math.floor(amount / 1000);
  }

  return Math.floor(amount);
}

export function formatMemory(bytes: number): string {
  if (bytes >= UNITS.Gi) {
    const gi = bytes / UNITS.Gi;
    return Number.isInteger(gi) ? `${gi}Gi` : `${gi.toFixed(1)}Gi`;
  }
  if (bytes >= UNITS.Mi) {
    const mi = bytes / UNITS.Mi;
    return Number.isInteger(mi) ? `${mi}Mi` : `${mi.toFixed(1)}Mi`;
  }
  return `${bytes}`;
}

export function bumpMemoryLimit(current: string, maxLimit: string): string {
  const currentBytes = parseMemoryToBytes(current);
  const maxBytes = parseMemoryToBytes(maxLimit);
  if (currentBytes <= 0 || maxBytes <= 0) return current;

  let bumped = Math.min(Math.floor(currentBytes * 1.5), maxBytes);
  if (bumped <= currentBytes) {
    bumped = Math.min(currentBytes + 512 * UNITS.Mi, maxBytes);
  }
  if (bumped <= currentBytes) {
    return current;
  }
  return formatMemory(bumped);
}
