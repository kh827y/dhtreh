declare module "html5-qrcode" {
  export class Html5Qrcode {
    constructor(elementId: string);
    start(
      config: { facingMode: "environment" },
      options: { fps: number; qrbox: { width: number; height: number } },
      onSuccess: (decodedText: string) => void,
      onError: (errorMessage: string) => void,
    ): Promise<void>;
    stop(): Promise<void>;
    clear(): Promise<void>;
  }
}
