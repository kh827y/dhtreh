export function applyCurlyPlaceholders(
  template: string,
  vars: Record<string, string | number | null | undefined>,
): string {
  const text = typeof template === 'string' ? template : '';
  if (!text) return '';

  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(vars ?? {})) {
    const k = String(key || '').toLowerCase();
    if (!k) continue;
    normalized[k] = value === null || value === undefined ? '' : String(value);
  }

  return text.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, rawKey) => {
    const key = String(rawKey || '').toLowerCase();
    if (!key) return match;
    if (!(key in normalized)) return match;
    return normalized[key] ?? '';
  });
}

