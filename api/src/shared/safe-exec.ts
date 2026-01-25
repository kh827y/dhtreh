import { logIgnoredError } from './logging/ignore-error.util';

type LoggerLike = { warn?: (message: string) => void };

export const safeExec = <T>(
  action: () => T,
  fallback: () => T,
  logger?: LoggerLike,
  message?: string,
  context?: Record<string, unknown>,
): T => {
  try {
    return action();
  } catch (err) {
    logIgnoredError(err, message, logger, 'warn', context);
    return fallback();
  }
};

export const safeExecAsync = async <T>(
  action: () => Promise<T>,
  fallback: () => Promise<T>,
  logger?: LoggerLike,
  message?: string,
  context?: Record<string, unknown>,
): Promise<T> => {
  try {
    return await action();
  } catch (err) {
    logIgnoredError(err, message, logger, 'warn', context);
    return await fallback();
  }
};
