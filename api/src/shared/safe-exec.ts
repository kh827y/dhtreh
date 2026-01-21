import { Logger } from '@nestjs/common';

type LoggerLike = { warn: (message: string) => void };

const defaultLogger = new Logger('safe-exec');

const formatError = (err: unknown): string => {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  if (
    typeof err === 'number' ||
    typeof err === 'boolean' ||
    typeof err === 'bigint'
  ) {
    return String(err);
  }
  if (err == null) return 'unknown error';
  try {
    return JSON.stringify(err);
  } catch (_err) {
    return 'unknown error';
  }
};

const logError = (
  logger: LoggerLike | undefined,
  message: string | undefined,
  err: unknown,
) => {
  const prefix = message ? `${message}: ` : '';
  const line = `${prefix}${formatError(err)}`;
  const warn = logger?.warn;
  if (typeof warn === 'function') {
    try {
      warn.call(logger, line);
      return;
    } catch (_err) {
      // fall through to default logger
    }
  }
  defaultLogger.warn(line);
};

export const safeExec = <T>(
  action: () => T,
  fallback: () => T,
  logger?: LoggerLike,
  message?: string,
): T => {
  try {
    return action();
  } catch (err) {
    logError(logger, message, err);
    return fallback();
  }
};

export const safeExecAsync = async <T>(
  action: () => Promise<T>,
  fallback: () => Promise<T>,
  logger?: LoggerLike,
  message?: string,
): Promise<T> => {
  try {
    return await action();
  } catch (err) {
    logError(logger, message, err);
    return await fallback();
  }
};
