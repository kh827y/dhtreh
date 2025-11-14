// Общий хук для unit-тестов: достаточно зафиксировать таймаут и окружение.
const DEFAULT_TIMEOUT = Number(process.env.JEST_TIMEOUT ?? 30000);

if (typeof jest !== 'undefined' && typeof jest.setTimeout === 'function') {
  jest.setTimeout(DEFAULT_TIMEOUT);
}

export {};
