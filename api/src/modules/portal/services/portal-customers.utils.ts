export const normalizeFlag = (input: unknown): boolean => {
  if (typeof input === 'string') {
    const normalized = input.trim().toLowerCase();
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  }
  if (typeof input === 'number') {
    return input !== 0;
  }
  return Boolean(input);
};

export const sanitizeTags = (input: unknown): string[] => {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
};

export const splitName = (
  fullName: string | null | undefined,
): { firstName: string | null; lastName: string | null } => {
  if (!fullName) return { firstName: null, lastName: null };
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: null, lastName: null };
  const [first, ...rest] = parts;
  return {
    firstName: first || null,
    lastName: rest.length ? rest.join(' ') : null,
  };
};
