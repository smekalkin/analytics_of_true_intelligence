import { Type } from 'class-transformer';
import { IsInt, IsOptional, Matches, Max, Min } from 'class-validator';
import { MAX_DB_INT } from './id-param.pipe';
import { ISO_DATE_RE } from './period';

/** Общие параметры фильтрации: компания, филиал, период. */
export class ScopeQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'companyId должен быть целым числом' })
  @Min(1)
  @Max(MAX_DB_INT, { message: 'companyId вне допустимого диапазона' })
  companyId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'branchId должен быть целым числом' })
  @Min(1)
  @Max(MAX_DB_INT, { message: 'branchId вне допустимого диапазона' })
  branchId?: number;
}

export class PeriodQueryDto extends ScopeQueryDto {
  @IsOptional()
  @Matches(ISO_DATE_RE, { message: 'from должен быть в формате YYYY-MM-DD' })
  from?: string;

  @IsOptional()
  @Matches(ISO_DATE_RE, { message: 'to должен быть в формате YYYY-MM-DD' })
  to?: string;
}
