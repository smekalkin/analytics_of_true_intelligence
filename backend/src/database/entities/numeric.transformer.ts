import { ValueTransformer } from 'typeorm';

/** pg отдаёт NUMERIC строкой — приводим к number. */
export const numericTransformer: ValueTransformer = {
  to: (value: number | null | undefined) => value,
  from: (value: string | null) => (value === null || value === undefined ? null : Number(value)),
};
