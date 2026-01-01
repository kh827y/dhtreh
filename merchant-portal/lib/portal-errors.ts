const ACCESS_DENIED_MESSAGE = "Недостаточно прав";

const ACCESS_DENIED_PATTERNS = [
  /недостаточно прав/i,
  /доступ запрещ/i,
  /нет доступа/i,
  /forbidden/i,
  /access denied/i,
];

function normalizeAccessDeniedMessage(message: string | null): string | null {
  if (!message) return null;
  const trimmed = message.trim();
  if (!trimmed) return null;
  const lowered = trimmed.toLowerCase();
  if (ACCESS_DENIED_PATTERNS.some((pattern) => pattern.test(lowered))) {
    return ACCESS_DENIED_MESSAGE;
  }
  return trimmed;
}

function extractMessage(payload: unknown): string | null {
  if (!payload) return null;
  if (payload instanceof Error) {
    return payload.message || null;
  }
  if (typeof payload === "string") {
    const trimmed = payload.trim();
    if (!trimmed) return null;
    const looksLikeJson =
      (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
      (trimmed.startsWith("[") && trimmed.endsWith("]"));
    if (looksLikeJson) {
      try {
        return extractMessage(JSON.parse(trimmed));
      } catch {}
    }
    return trimmed;
  }
  if (typeof payload === "object") {
    const anyPayload = payload as any;
    const message = anyPayload?.message;
    if (Array.isArray(message)) {
      const joined = message.filter(Boolean).join(", ");
      return joined || null;
    }
    if (typeof message === "string") return message;
    if (typeof anyPayload?.error === "string") return anyPayload.error;
  }
  return null;
}

export function readApiError(payload: unknown): string | null {
  const message = extractMessage(payload);
  return normalizeAccessDeniedMessage(message);
}

export async function readErrorMessage(res: Response, fallback: string) {
  const text = await res.text().catch(() => "");
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  if (res.status === 403) return ACCESS_DENIED_MESSAGE;
  return readApiError(parsed) || fallback;
}

export function normalizeErrorMessage(payload: unknown, fallback: string) {
  return readApiError(payload) || fallback;
}

export { ACCESS_DENIED_MESSAGE, normalizeAccessDeniedMessage };
