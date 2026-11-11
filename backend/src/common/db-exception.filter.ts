import { ArgumentsHost, Catch, ExceptionFilter, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { QueryFailedError } from 'typeorm';

/**
 * Страховка: если некорректное значение всё же дошло до БД, класс ошибок PostgreSQL 22xxx
 * («data exception»: переполнение, неверная дата и т.п.) — это ошибка клиента (400), а не сервера.
 * Остальные ошибки БД — 500 без деталей наружу.
 */
@Catch(QueryFailedError)
export class DbExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Database');

  catch(err: QueryFailedError & { code?: string }, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    if (typeof err.code === 'string' && err.code.startsWith('22')) {
      res.status(400).json({ statusCode: 400, error: 'Bad Request', message: 'Некорректные параметры запроса' });
      return;
    }
    this.logger.error(err.message, err.stack);
    res.status(500).json({ statusCode: 500, error: 'Internal Server Error', message: 'Internal server error' });
  }
}
