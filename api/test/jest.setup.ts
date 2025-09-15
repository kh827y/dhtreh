// Jest unit setup: disable background workers and default metrics timers to avoid open handles
beforeAll(() => {
  process.env.WORKERS_ENABLED = '0';
  process.env.METRICS_DEFAULTS = '0';
});
