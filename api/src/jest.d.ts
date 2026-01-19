import 'jest';

/* eslint-disable @typescript-eslint/no-unused-vars */

declare global {
  namespace jest {
    interface Mock<T = any, Y extends any[] = any> {
      mockResolvedValue(value: Awaited<T>): this;
      mockResolvedValueOnce(value: Awaited<T>): this;
    }
    interface MockInstance<T = any, Y extends any[] = any> {
      mockResolvedValue(value: Awaited<T>): this;
      mockResolvedValueOnce(value: Awaited<T>): this;
    }
    interface SpyInstance<T = any, Y extends any[] = any> {
      mockResolvedValue(value: Awaited<T>): this;
      mockResolvedValueOnce(value: Awaited<T>): this;
    }
  }
}

export {};
