import { pollLoyaltyEvents, type LoyaltyRealtimeEvent } from "./api";

export const LOYALTY_EVENT_CHANNEL = "loyalty:events";
export const LOYALTY_EVENT_STORAGE_KEY = "loyalty:lastEvent";

type EventHandler = (payload: unknown) => void;

type SubscriptionOptions = {
  emitCached?: boolean;
  merchantId?: string | null;
  customerId?: string | null;
};

const subscribers = new Set<EventHandler>();
const pollers = new Map<
  string,
  { count: number; stop: () => void; merchantId: string; customerId: string }
>();
let sharedChannel: BroadcastChannel | null = null;
let storageListenerAttached = false;

function normalizeEventPayload(payload: unknown): unknown {
  if (!payload || typeof payload !== "object") return payload;
  const maybeEvent = payload as { customerId?: unknown; merchantCustomerId?: unknown };
  const cid =
    (typeof maybeEvent.customerId === "string" && maybeEvent.customerId.trim()) ||
    (typeof maybeEvent.merchantCustomerId === "string" && maybeEvent.merchantCustomerId.trim()) ||
    null;
  if (!cid) return payload;
  return { ...maybeEvent, customerId: cid };
}

function ensureChannel() {
  if (sharedChannel || typeof window === "undefined") return;
  if (!("BroadcastChannel" in window)) return;
  try {
    sharedChannel = new BroadcastChannel(LOYALTY_EVENT_CHANNEL);
    sharedChannel.onmessage = (event) => dispatchEvent(event.data, false);
  } catch {
    sharedChannel = null;
  }
}

function ensureStorageListener() {
  if (storageListenerAttached || typeof window === "undefined") return;
  const handleStorage = (event: StorageEvent) => {
    if (event.key !== LOYALTY_EVENT_STORAGE_KEY || !event.newValue) return;
    try {
      const payload = JSON.parse(event.newValue);
      dispatchEvent(payload, false);
    } catch {
      // ignore
    }
  };
  window.addEventListener("storage", handleStorage);
  storageListenerAttached = true;
}

function dispatchEvent(payload: unknown, replicate = true) {
  const normalized = normalizeEventPayload(payload);
  for (const handler of subscribers) {
    try {
      handler(normalized);
    } catch {
      // ignore individual handler errors
    }
  }
  if (!replicate || typeof window === "undefined") return;
  try {
    localStorage.setItem(LOYALTY_EVENT_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // ignore storage errors
  }
  try {
    sharedChannel?.postMessage(normalized);
  } catch {
    // ignore broadcast channel errors
  }
}

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function acquirePoller(key: string, merchantId: string, customerId: string) {
  const existing = pollers.get(key);
  if (existing) {
    existing.count += 1;
    return;
  }
  let stopped = false;
  const controller = new AbortController();
  const stop = () => {
    if (stopped) return;
    stopped = true;
    controller.abort();
    pollers.delete(key);
  };
  pollers.set(key, { count: 1, stop, merchantId, customerId });

  const loop = async () => {
    while (!stopped) {
      try {
        const response = await pollLoyaltyEvents(merchantId, customerId, controller.signal);
        if (controller.signal.aborted || stopped) break;
        const event = response?.event as LoyaltyRealtimeEvent | null;
        if (event) {
          dispatchEvent(normalizeEventPayload(event), true);
          continue;
        }
      } catch {
        if (controller.signal.aborted || stopped) break;
        await delay(1200);
      }
    }
  };

  void loop();
}

function releasePoller(key: string) {
  const entry = pollers.get(key);
  if (!entry) return;
  entry.count -= 1;
  if (entry.count <= 0) {
    entry.stop();
  } else {
    pollers.set(key, entry);
  }
}

export function emitLoyaltyEvent(payload: unknown) {
  if (typeof window === "undefined") return;
  ensureChannel();
  ensureStorageListener();
  dispatchEvent(payload, true);
}

export function subscribeToLoyaltyEvents(handler: EventHandler, options: SubscriptionOptions = {}) {
  if (typeof window === "undefined") return () => undefined;
  const { emitCached = true, merchantId, customerId } = options;
  ensureChannel();
  ensureStorageListener();
  subscribers.add(handler);

  if (emitCached) {
    try {
      const cached = localStorage.getItem(LOYALTY_EVENT_STORAGE_KEY);
      if (cached) {
        handler(JSON.parse(cached));
      }
    } catch {
      // ignore cached errors
    }
  }

  let pollerKey: string | null = null;
  if (merchantId && customerId) {
    pollerKey = `${merchantId}:${customerId}`;
    acquirePoller(pollerKey, merchantId, customerId);
  }

  return () => {
    subscribers.delete(handler);
    if (pollerKey) {
      releasePoller(pollerKey);
    }
  };
}
