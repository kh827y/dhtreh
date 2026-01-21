type LoggerLike = {
  log: (message: string) => void;
  warn?: (message: string) => void;
};

type MetricsLike = {
  inc: (name: string, labels?: Record<string, string>, value?: number) => void;
};

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

export const logEvent = (
  logger: LoggerLike,
  event: string,
  payload: Record<string, unknown> = {},
) => {
  try {
    logger.log(JSON.stringify({ event, ...payload }));
  } catch (err) {
    const warn = logger.warn ?? logger.log;
    try {
      warn.call(logger, `event_log_failed: ${event}: ${formatError(err)}`);
    } catch (_err) {
      // ignore secondary logging failure
    }
  }
};

export const safeMetric = (
  metrics: MetricsLike,
  name: string,
  labels?: Record<string, string>,
  value?: number,
  logger?: LoggerLike,
) => {
  try {
    metrics.inc(name, labels, value);
  } catch (err) {
    if (!logger) return;
    const warn = logger.warn ?? logger.log;
    try {
      warn.call(logger, `metric_failed: ${name}: ${formatError(err)}`);
    } catch (_err) {
      // ignore secondary logging failure
    }
  }
};
