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
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  configurable: true,
  writable: true,
});
globalObject.HTMLElement = dom.window.HTMLElement as unknown as typeof HTMLElement;
globalObject.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;
