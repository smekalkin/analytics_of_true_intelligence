import { MIN_SECRET_LENGTH, resolveJwtSecret } from './jwt-secret';

describe('resolveJwtSecret', () => {
  const strong = 'x'.repeat(MIN_SECRET_LENGTH);

  it('без ключа генерирует случайный (разный при каждом запуске)', () => {
    const a = resolveJwtSecret(undefined, 'production');
    const b = resolveJwtSecret('  ', 'production');
    expect(a.length).toBeGreaterThanOrEqual(MIN_SECRET_LENGTH);
    expect(a).not.toEqual(b);
  });

  it('в production отказывается от известного или короткого ключа', () => {
    expect(() => resolveJwtSecret('dev-only-secret-change-me', 'production')).toThrow(/небезопасен/);
    expect(() => resolveJwtSecret('short', 'production')).toThrow(/небезопасен/);
  });

  it('вне production слабый ключ допустим (с предупреждением), надёжный — всегда', () => {
    expect(resolveJwtSecret('short', 'development')).toBe('short');
    expect(resolveJwtSecret(strong, 'production')).toBe(strong);
  });
});
