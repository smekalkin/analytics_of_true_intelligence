import { Type } from 'class-transformer';
import { IsInt, IsOptional, Matches, Max, Min } from 'class-validator';
import { MAX_DB_INT } from '../common/id-param.pipe';
import { ISO_DATE_RE } from '../common/period';
import { ScopeQueryDto } from '../common/scope-query.dto';

export class SyncRequestDto {
  // Без @Type: в JSON id — число; строки и true не превращаем в 1 молча
  @IsInt({ message: 'branchId обязателен и должен быть целым числом' })
  @Min(1)
  @Max(MAX_DB_INT, { message: 'branchId вне допустимого диапазона' })
  branchId: number;

  @IsOptional()
  @Matches(ISO_DATE_RE, { message: 'from должен быть в формате YYYY-MM-DD' })
  from?: string;

  @IsOptional()
  @Matches(ISO_DATE_RE, { message: 'to должен быть в формате YYYY-MM-DD' })
  to?: string;
}

export class SyncJobsQueryDto extends ScopeQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
