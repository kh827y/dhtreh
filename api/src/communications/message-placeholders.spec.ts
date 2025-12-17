import { applyCurlyPlaceholders } from './message-placeholders';

describe('applyCurlyPlaceholders', () => {
  it('replaces known placeholders', () => {
    expect(
      applyCurlyPlaceholders('Акция {name}: +{bonus} для {client}', {
        name: 'Супер-акция',
        bonus: 100,
        client: 'Алексей',
      }),
    ).toBe('Акция Супер-акция: +100 для Алексей');
  });

  it('leaves unknown placeholders intact', () => {
    expect(
      applyCurlyPlaceholders('Hello {unknown} {name}', { name: 'World' }),
    ).toBe('Hello {unknown} World');
  });

  it('is case-insensitive by key', () => {
    expect(applyCurlyPlaceholders('{Name} {BONUS}', { name: 'A', bonus: 1 })).toBe(
      'A 1',
    );
  });
});

