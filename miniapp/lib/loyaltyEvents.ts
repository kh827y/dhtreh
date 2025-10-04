export const LOYALTY_EVENT_CHANNEL = "loyalty:events";
export const LOYALTY_EVENT_STORAGE_KEY = "loyalty:lastEvent";

type EventHandler = (payload: unknown) => void;

type SubscriptionOptions = {
  emitCached?: boolean;
};

export function subscribeToLoyaltyEvents(handler: EventHandler, options: SubscriptionOptions = {}) {
  if (typeof window === "undefined") return () => undefined;
  const { emitCached = true } = options;
  let channel: BroadcastChannel | null = null;
  if ("BroadcastChannel" in window) {
    try {
      channel = new BroadcastChannel(LOYALTY_EVENT_CHANNEL);
      channel.onmessage = (event) => handler(event.data);
    } catch {
      channel = null;
    }
  }
  const handleStorage = (event: StorageEvent) => {
    if (event.key !== LOYALTY_EVENT_STORAGE_KEY || !event.newValue) return;
    try {
      handler(JSON.parse(event.newValue));
    } catch {
      // ignore
    }
  };
  window.addEventListener("storage", handleStorage);
  if (emitCached) {
    try {
      const cached = localStorage.getItem(LOYALTY_EVENT_STORAGE_KEY);
      if (cached) {
        handler(JSON.parse(cached));
      }
    } catch {
      // ignore
    }
  }
  return () => {
    window.removeEventListener("storage", handleStorage);
    if (channel) {
      try {
        channel.close();
      } catch {
        // ignore
      }
    }
  };
}
