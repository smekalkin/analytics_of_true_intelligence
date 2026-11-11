import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { buildDataSourceOptions } from '../src/database/data-source';
import { setupApp } from '../src/setup-app';

/** Пересоздаёт схему тестовой БД миграциями. Отказывается работать с не-тестовой базой. */
export async function openTestDatabase(): Promise<DataSource> {
  const ds = await new DataSource(buildDataSourceOptions()).initialize();
  const [{ db }] = await ds.query('SELECT current_database() AS db');
  if (!String(db).endsWith('_test')) {
    await ds.destroy();
    throw new Error(`Отказ: e2e-тесты пересоздают схему, а БД "${db}" не тестовая`);
  }
  await ds.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await ds.runMigrations();
  return ds;
}

export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ logger: ['error'] });
  setupApp(app);
  await app.init();
  return app;
}

export async function login(app: INestApplication, email: string, password: string): Promise<string> {
  const res = await request(app.getHttpServer()).post('/api/auth/login').send({ email, password }).expect(200);
  return res.body.accessToken;
}
