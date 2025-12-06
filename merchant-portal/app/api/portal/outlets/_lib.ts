export function normalizeReviewsShareLinks(input: unknown) {
  if (!input || typeof input !== 'object') return undefined;
  const result: Record<string, string | null> = {};
  for (const [rawKey, rawValue] of Object.entries(input as Record<string, unknown>)) {
    const key = String(rawKey || '').toLowerCase().trim();
    if (!key) continue;
    if (rawValue == null) {
      result[key] = null;
      continue;
    }
    if (typeof rawValue === 'string') {
      const trimmed = rawValue.trim();
      result[key] = trimmed.length ? trimmed : null;
    }
  }
  return Object.keys(result).length ? result : {};
}

export function normalizeDevices(input: unknown) {
  if (!Array.isArray(input)) return undefined;
  const devices: Array<{ code: string }> = [];
  for (const item of input) {
    const code =
      typeof item === 'string'
        ? item.trim()
        : String((item as any)?.code ?? '').trim();
    if (!code) continue;
    if (devices.length >= 50) break;
    devices.push({ code });
  }
  return devices;
}
