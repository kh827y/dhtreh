import { Logger } from '@nestjs/common';

type LoggerLike = {
  warn?: (message: string) => void;
  debug?: (message: string) => void;
  log?: (message: string) => void;
};

const defaultLogger = new Logger('ignore-error');

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
  } catch {
    return 'unknown error';
  }
};

const resolveLogger = (logger?: LoggerLike) => {
  if (logger) return logger;
  return defaultLogger;
};

const logWithLevel = (
  logger: LoggerLike,
  level: 'warn' | 'debug',
  message: string,
) => {
  const logFn = level === 'debug' ? logger.debug : logger.warn;
  if (typeof logFn === 'function') {
    logFn.call(logger, message);
    return;
  }
  const fallback = logger.log ?? logger.warn ?? logger.debug;
  if (typeof fallback === 'function') {
    fallback.call(logger, message);
  }
};

export const logIgnoredError = (
  err: unknown,
  message?: string,
  logger?: LoggerLike,
  level: 'warn' | 'debug' = 'warn',
) => {
  const prefix = message ? `${message}: ` : '';
  const line = `${prefix}${formatError(err)}`;
  try {
    logWithLevel(resolveLogger(logger), level, line);
  } catch {
    // Ignore logging failures to avoid infinite loops.
  }
};
