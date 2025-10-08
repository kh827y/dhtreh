// Jest e2e setup: filter noisy Firebase warning only in tests and disable background workers/metrics defaults

const ORIGINAL_WARN = console.warn;

beforeAll(() => {
  process.env.WORKERS_ENABLED = '0';
  process.env.METRICS_DEFAULTS = '0';
  // Spy and filter only the specific line coming from FcmProvider
  jest.spyOn(console, 'warn').mockImplementation((...args: any[]) => {
    const first = args[0];
    if (
      typeof first === 'string' &&
      first.includes('Firebase service account not configured')
    ) {
      return; // swallow this one warning
    }
    return ORIGINAL_WARN.apply(console, args as any);
  });
});

afterAll(async () => {
  // Restore console.warn to its original behavior
  (console.warn as any)?.mockRestore?.();
});
