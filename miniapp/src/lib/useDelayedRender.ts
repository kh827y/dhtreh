"use client";

import { useEffect, useState } from "react";

type PresenceStatus = "entered" | "exiting" | "unmounted";

/**
 * Управляет отложенным размонтированием элемента, чтобы дать CSS-анимациям закрытия завершиться.
 */
export function useDelayedRender(active: boolean, duration = 220) {
  const [shouldRender, setShouldRender] = useState<boolean>(active);

  useEffect(() => {
    let timeoutId: number | undefined;
    if (active) {
      setShouldRender(true);
    } else if (shouldRender) {
      timeoutId = window.setTimeout(() => {
        setShouldRender(false);
      }, duration);
    }
    return () => {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [active, duration, shouldRender]);

  const status: PresenceStatus = active ? "entered" : shouldRender ? "exiting" : "unmounted";

  return { shouldRender, status };
}

