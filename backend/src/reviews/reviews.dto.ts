import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { ToIntArray } from '../common/query-transforms';
import { PeriodQueryDto } from '../common/scope-query.dto';
import { ReviewStatus } from '../database/entities';

export class ReviewsQueryDto extends PeriodQueryDto {
  /** Один или несколько рейтингов: ?rating=1,2 */
  @IsOptional()
  @ToIntArray()
  @IsInt({ each: true, message: 'rating — целые числа от 1 до 5' })
  @Min(1, { each: true, message: 'rating — целые числа от 1 до 5' })
  @Max(5, { each: true, message: 'rating — целые числа от 1 до 5' })
  rating?: number[];

  @IsOptional()
  @IsEnum(ReviewStatus, { message: `status должен быть одним из: ${Object.values(ReviewStatus).join(', ')}` })
  status?: ReviewStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page должен быть целым числом' })
  @Min(1, { message: 'page должен быть не меньше 1' })
  @Max(100_000, { message: 'page слишком большой' })
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit должен быть целым числом' })
  @Min(1, { message: 'limit — от 1 до 100' })
  @Max(100, { message: 'limit — от 1 до 100' })
  limit?: number;
}

export class UpdateReviewDto {
  // Поле можно не передавать, но null недопустим (статус обязателен в БД)
  @ValidateIf((_, v) => v !== undefined)
  @IsEnum(ReviewStatus, { message: `status должен быть одним из: ${Object.values(ReviewStatus).join(', ')}` })
  status?: ReviewStatus;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(2000)
  reply?: string | null;
}
