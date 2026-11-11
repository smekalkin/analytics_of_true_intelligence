import { Transform } from 'class-transformer';

/** "?ids=1,2" или "?ids=1&ids=2" → [1, 2] */
export const ToIntArray = () =>
  Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    const list = Array.isArray(value) ? value : String(value).split(',');
    return list.map((v) => String(v).trim()).filter(Boolean).map(Number);
  });
