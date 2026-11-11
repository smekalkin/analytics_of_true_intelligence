import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DbExceptionFilter } from './common/db-exception.filter';

/** Общая настройка приложения — используется и в main.ts, и в e2e-тестах. */
export function setupApp(app: INestApplication): void {
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new DbExceptionFilter());
}
