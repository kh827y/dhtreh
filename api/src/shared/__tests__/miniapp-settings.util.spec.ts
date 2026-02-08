import {
  normalizeSupportTelegramInput,
  readPublicMiniappSettings,
  readReviewsEnabledFromRules,
  readSupportTelegramFromRules,
  withSupportTelegramInRules,
} from '../miniapp-settings.util';

describe('miniapp-settings.util', () => {
  it('normalizes support telegram input', () => {
    expect(normalizeSupportTelegramInput('  @support  ')).toBe('@support');
    expect(normalizeSupportTelegramInput('   ')).toBeNull();
    expect(normalizeSupportTelegramInput(42)).toBeNull();
  });

  it('reads support telegram from rules', () => {
    expect(
      readSupportTelegramFromRules({ miniapp: { supportTelegram: ' @help ' } }),
    ).toBe('@help');
    expect(readSupportTelegramFromRules({ miniapp: {} })).toBeNull();
  });

  it('reads reviews enabled with fallback', () => {
    expect(readReviewsEnabledFromRules({ reviews: { enabled: false } }, true)).toBe(false);
    expect(readReviewsEnabledFromRules({}, true)).toBe(true);
    expect(readReviewsEnabledFromRules({}, false)).toBe(false);
  });

  it('writes support telegram into rules without dropping other sections', () => {
    const next = withSupportTelegramInRules(
      { reviews: { enabled: true }, miniapp: { foo: 'bar' } },
      '@next',
    );

    expect(next).toEqual(
      expect.objectContaining({
        reviews: { enabled: true },
        miniapp: { foo: 'bar', supportTelegram: '@next' },
      }),
    );
  });

  it('returns public miniapp settings snapshot', () => {
    expect(
      readPublicMiniappSettings({
        miniapp: { supportTelegram: ' @support_bot ' },
        reviews: { enabled: false },
      }),
    ).toEqual({
      supportTelegram: '@support_bot',
      reviewsEnabled: false,
    });
  });
});
