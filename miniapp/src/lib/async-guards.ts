import { useCallback, useRef } from "react";

export function useLatestRequest() {
  const requestIdRef = useRef(0);

  const start = useCallback(() => {
    requestIdRef.current += 1;
    return requestIdRef.current;
  }, []);

  const isLatest = useCallback((id: number) => id === requestIdRef.current, []);

  return { start, isLatest };
}

export function useActionGuard() {
  const inFlightRef = useRef(false);

  return useCallback(async <T>(action: () => Promise<T>): Promise<T | undefined> => {
    if (inFlightRef.current) return undefined;
    inFlightRef.current = true;
    try {
      return await action();
    } finally {
      inFlightRef.current = false;
    }
  }, []);
}
