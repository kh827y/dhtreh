import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost" });

const globalObject = globalThis as unknown as {
  window: Window;
  self: Window;
  document: Document;
  HTMLElement: typeof HTMLElement;
  ResizeObserver: typeof ResizeObserver;
};

globalObject.window = dom.window as unknown as Window;
globalObject.self = dom.window as unknown as Window;
globalObject.document = dom.window.document as unknown as Document;
const globalWithAlert = globalThis as typeof globalThis & { alert?: () => void };
globalWithAlert.alert = () => {};
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  configurable: true,
  writable: true,
});
Object.defineProperty(dom.window, "matchMedia", {
  value: (query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent() {
      return false;
    },
  }),
  writable: true,
  configurable: true,
});
globalObject.HTMLElement = dom.window.HTMLElement as unknown as typeof HTMLElement;
globalObject.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;
