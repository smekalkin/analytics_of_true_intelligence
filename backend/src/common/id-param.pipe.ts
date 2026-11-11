import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

/** Максимум PostgreSQL INT — большие значения иначе превращаются в ошибку БД (500). */
export const MAX_DB_INT = 2_147_483_647;

/** Положительный целочисленный идентификатор в пути (`/branches/:id`). */
@Injectable()
export class IdParamPipe implements PipeTransform<string, number> {
  transform(value: string): number {
    if (!/^\d{1,10}$/.test(value)) throw new BadRequestException('Идентификатор должен быть положительным целым числом');
    const id = Number(value);
    if (id < 1 || id > MAX_DB_INT) throw new BadRequestException('Идентификатор вне допустимого диапазона');
    return id;
  }
}
