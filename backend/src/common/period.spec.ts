import { BadRequestException } from '@nestjs/common';
import { previousPeriod, resolvePeriod } from './period';

describe('resolvePeriod', () => {
  it('считает длину периода включительно и строит предыдущий период той же длины', () => {
    const p = resolvePeriod('2026-02-25', '2026-03-03');
    expect(p).toEqual({ from: '2026-02-25', to: '2026-03-03', days: 7 });
    expect(previousPeriod(p)).toEqual({ from: '2026-02-18', to: '2026-02-24', days: 7 });
  });

  it('по умолчанию — 30 дней', () => {
    expect(resolvePeriod(undefined, '2026-01-30')).toEqual({ from: '2026-01-01', to: '2026-01-30', days: 30 });
  });

  it.each([
    ['2026-02-30', '2026-03-01'], // несуществующая дата
    ['2026-03-10', '2026-03-01'], // from > to
    ['2024-01-01', '2026-01-01'], // слишком длинный период
  ])('отклоняет некорректный период %s..%s', (from, to) => {
    expect(() => resolvePeriod(from, to)).toThrow(BadRequestException);
  });
});
