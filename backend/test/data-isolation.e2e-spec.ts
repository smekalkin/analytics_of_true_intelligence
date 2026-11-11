/**
 * E2E: изоляция данных разных компаний через прямые API-запросы.
 * Поднимает реальное Nest-приложение поверх тестовой PostgreSQL (схема пересоздаётся миграциями).
 */
import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp, login, openTestDatabase } from './helpers';

const PASSWORD = 'secret-pass';
const PERIOD = { from: '2026-01-01', to: '2026-01-03' };

interface Fixture {
  companyA: number;
  companyB: number;
  branchA1: number;
  branchA2: number;
  branchB1: number;
  reviewA: number;
  reviewB: number;
}

async function insertFixture(ds: DataSource): Promise<Fixture> {
  const hash = await bcrypt.hash(PASSWORD, 4);
  const one = async (sql: string, params: unknown[]) => (await ds.query(sql, params))[0].id as number;

  const companyA = await one(`INSERT INTO companies (name) VALUES ('Компания A') RETURNING id`, []);
  const companyB = await one(`INSERT INTO companies (name) VALUES ('Компания B') RETURNING id`, []);

  await ds.query(
    `INSERT INTO users (email, password_hash, full_name, role, company_id) VALUES
       ('admin@test.local', $1, 'Админ', 'admin', NULL),
       ('a@test.local', $1, 'Клиент A', 'client', $2),
       ('b@test.local', $1, 'Клиент B', 'client', $3)`,
    [hash, companyA, companyB],
  );

  const branch = (companyId: number, name: string) =>
    one(`INSERT INTO branches (company_id, name, city, address) VALUES ($1, $2, 'Город', 'Адрес') RETURNING id`, [companyId, name]);
  const branchA1 = await branch(companyA, 'A-1');
  const branchA2 = await branch(companyA, 'A-2');
  const branchB1 = await branch(companyB, 'B-1');

  // Значения подобраны так, чтобы любая «утечка» данных B меняла итоги A:
  // A: views = 100+110+120 (A1) + 10+10+10 (A2) = 360; B: 1000 × 3 = 3000.
  const metric = (branchId: number, date: string, views: number, rating: number, reviews: number) =>
    ds.query(
      `INSERT INTO daily_metrics (branch_id, date, views, website_clicks, calls, routes, rating, reviews_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [branchId, date, views, Math.round(views / 10), Math.round(views / 20), Math.round(views / 5), rating, reviews],
    );
  for (const [i, date] of ['2026-01-01', '2026-01-02', '2026-01-03'].entries()) {
    await metric(branchA1, date, 100 + i * 10, 4.5, 1);
    await metric(branchA2, date, 10, 4.0, 0);
    await metric(branchB1, date, 1000, 2.0, 5);
  }

  const review = (branchId: number, rating: number, status: string) =>
    one(
      `INSERT INTO reviews (branch_id, source, author_name, rating, text, status, published_at)
       VALUES ($1, 'yandex', 'Автор', $2, 'Текст', $3, '2026-01-02T10:00:00Z') RETURNING id`,
      [branchId, rating, status],
    );
  const reviewA = await review(branchA1, 5, 'new');
  await review(branchA2, 2, 'in_progress');
  const reviewB = await review(branchB1, 1, 'new');
  await review(branchB1, 1, 'new');

  return { companyA, companyB, branchA1, branchA2, branchB1, reviewA, reviewB };
}

describe('Изоляция данных компаний (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let fx: Fixture;
  const tokens: Record<'admin' | 'a' | 'b', string> = { admin: '', a: '', b: '' };

  const api = (who: keyof typeof tokens) => ({
    get: (url: string) => request(app.getHttpServer()).get(url).set('Authorization', `Bearer ${tokens[who]}`),
    patch: (url: string) => request(app.getHttpServer()).patch(url).set('Authorization', `Bearer ${tokens[who]}`),
  });

  beforeAll(async () => {
    ds = await openTestDatabase();
    fx = await insertFixture(ds);
    app = await createTestApp();

    for (const [who, email] of [['admin', 'admin@test.local'], ['a', 'a@test.local'], ['b', 'b@test.local']] as const) {
      tokens[who] = await login(app, email, PASSWORD);
    }
  });

  afterAll(async () => {
    await app?.close();
    await ds?.destroy();
  });

  describe('аутентификация', () => {
    it('запросы без токена и с поддельным токеном отклоняются (401)', async () => {
      await request(app.getHttpServer()).get('/api/metrics/summary').expect(401);
      await request(app.getHttpServer()).get('/api/branches').set('Authorization', 'Bearer forged.token.value').expect(401);
    });

    it('неверный пароль → 401', async () => {
      await request(app.getHttpServer()).post('/api/auth/login').send({ email: 'a@test.local', password: 'wrong' }).expect(401);
    });
  });

  describe('клиент компании A', () => {
    it('видит только свою компанию и свои филиалы', async () => {
      const companies = await api('a').get('/api/companies').expect(200);
      expect(companies.body.map((c: { id: number }) => c.id)).toEqual([fx.companyA]);

      const branches = await api('a').get('/api/branches').expect(200);
      expect(branches.body.map((b: { id: number }) => b.id).sort()).toEqual([fx.branchA1, fx.branchA2].sort());
    });

    it('не может получить компанию, филиал или список филиалов компании B', async () => {
      await api('a').get(`/api/companies/${fx.companyB}`).expect(403);
      await api('a').get(`/api/branches?companyId=${fx.companyB}`).expect(403);
      await api('a').get(`/api/branches/${fx.branchB1}`).expect(404);
    });

    it('агрегированные метрики считаются только по филиалам A', async () => {
      const res = await api('a').get(`/api/metrics/summary?from=${PERIOD.from}&to=${PERIOD.to}`).expect(200);
      expect(res.body.scope).toEqual({ companyId: fx.companyA, branchId: null });
      expect(res.body.branchesCount).toBe(2);
      expect(res.body.current).toMatchObject({ views: 360, reviewsCount: 3, rating: 4.25 });
    });

    it('прямые запросы метрик компании B отклоняются', async () => {
      const q = `from=${PERIOD.from}&to=${PERIOD.to}`;
      await api('a').get(`/api/metrics/summary?${q}&companyId=${fx.companyB}`).expect(403);
      await api('a').get(`/api/metrics/summary?${q}&branchId=${fx.branchB1}`).expect(404);
      await api('a').get(`/api/metrics/timeseries?${q}&branchId=${fx.branchB1}`).expect(404);
      await api('a').get(`/api/metrics/by-branch?${q}&companyId=${fx.companyB}`).expect(403);
      // Подмена: свой companyId + чужой branchId
      await api('a').get(`/api/metrics/summary?${q}&companyId=${fx.companyA}&branchId=${fx.branchB1}`).expect(404);
    });

    it('динамика и разбивка по филиалам не содержат данных B', async () => {
      const ts = await api('a').get(`/api/metrics/timeseries?metric=views&from=${PERIOD.from}&to=${PERIOD.to}`).expect(200);
      expect(ts.body.points).toEqual([
        { date: '2026-01-01', value: 110 },
        { date: '2026-01-02', value: 120 },
        { date: '2026-01-03', value: 130 },
      ]);

      const bb = await api('a').get(`/api/metrics/by-branch?from=${PERIOD.from}&to=${PERIOD.to}`).expect(200);
      // Проверяем точный состав, а не только every(): every() истинно и на пустом списке
      expect(bb.body.items.map((i: { branchId: number }) => i.branchId).sort()).toEqual([fx.branchA1, fx.branchA2].sort());
      expect(bb.body.items.map((i: { totals: { views: number } }) => i.totals.views).sort()).toEqual([30, 330]);
    });

    it('видит только отзывы A и не может изменить отзыв B', async () => {
      const list = await api('a').get('/api/reviews').expect(200);
      expect(list.body.total).toBe(2);
      expect(list.body.items).toHaveLength(2);
      expect(list.body.items.every((r: { companyId: number }) => r.companyId === fx.companyA)).toBe(true);

      await api('a').get(`/api/reviews?companyId=${fx.companyB}`).expect(403);
      await api('a').patch(`/api/reviews/${fx.reviewB}`).send({ status: 'resolved', reply: 'взлом' }).expect(404);

      const [row] = await ds.query('SELECT status, reply FROM reviews WHERE id = $1', [fx.reviewB]);
      expect(row).toEqual({ status: 'new', reply: null });
    });
  });

  describe('клиент компании B (симметрично)', () => {
    it('видит только свои данные', async () => {
      const res = await api('b').get(`/api/metrics/summary?from=${PERIOD.from}&to=${PERIOD.to}`).expect(200);
      expect(res.body.current).toMatchObject({ views: 3000, reviewsCount: 15, rating: 2 });
      await api('b').get(`/api/branches/${fx.branchA1}`).expect(404);
      await api('b').patch(`/api/reviews/${fx.reviewA}`).send({ status: 'resolved' }).expect(404);
    });
  });

  describe('администратор', () => {
    it('видит все компании и агрегат по всем филиалам', async () => {
      const companies = await api('admin').get('/api/companies').expect(200);
      expect(companies.body).toHaveLength(2);

      const res = await api('admin').get(`/api/metrics/summary?from=${PERIOD.from}&to=${PERIOD.to}`).expect(200);
      expect(res.body.branchesCount).toBe(3);
      expect(res.body.current.views).toBe(3360);
    });

    it('может сузить выборку до компании или филиала B', async () => {
      const byCompany = await api('admin').get(`/api/metrics/summary?from=${PERIOD.from}&to=${PERIOD.to}&companyId=${fx.companyB}`).expect(200);
      expect(byCompany.body.current.views).toBe(3000);

      const byBranch = await api('admin').get(`/api/metrics/summary?from=${PERIOD.from}&to=${PERIOD.to}&branchId=${fx.branchA2}`).expect(200);
      expect(byBranch.body.scope).toEqual({ companyId: fx.companyA, branchId: fx.branchA2 });
      expect(byBranch.body.current.views).toBe(30);
    });

    it('несуществующая компания → 404, а не нулевые показатели', async () => {
      await api('admin').get('/api/metrics/summary?companyId=999999').expect(404);
    });
  });

  describe('модуль отзывов', () => {
    it('фильтрует по рейтингу и статусу и возвращает счётчики статусов', async () => {
      const res = await api('admin').get('/api/reviews?rating=1,2&status=new').expect(200);
      expect(res.body.total).toBe(2);
      expect(res.body.items.every((r: { rating: number; status: string }) => r.rating <= 2 && r.status === 'new')).toBe(true);
      expect(res.body.statusCounts).toEqual({ new: 2, in_progress: 1, resolved: 0 });
    });

    it('клиент меняет статус своего отзыва; resolved проставляет processedAt', async () => {
      const res = await api('a').patch(`/api/reviews/${fx.reviewA}`).send({ status: 'resolved', reply: 'Спасибо!' }).expect(200);
      expect(res.body).toMatchObject({ status: 'resolved', reply: 'Спасибо!' });
      expect(res.body.processedAt).not.toBeNull();
    });

    it('валидация параметров', async () => {
      await api('a').get('/api/reviews?rating=7').expect(400);
      await api('a').get('/api/reviews?status=deleted').expect(400);
      await api('a').patch(`/api/reviews/${fx.reviewA}`).send({ status: 'bogus' }).expect(400);
      await api('a').get('/api/metrics/summary?from=2026-05-10&to=2026-05-01').expect(400);
    });

    it('некорректный ввод даёт 400/404, а не 500', async () => {
      const bad400 = [
        '/api/branches/3000000000',
        '/api/companies/3000000000',
        '/api/branches/abc',
        `/api/metrics/summary?companyId=3000000000`,
        `/api/metrics/summary?branchId=3000000000`,
        '/api/metrics/summary?from=0001-01-01&to=0001-01-05',
        '/api/reviews?page=1e300',
        '/api/reviews?page=2.5',
        '/api/reviews?from=2026-02-30',
        '/api/reviews?to=2026-02-30',
      ];
      for (const url of bad400) {
        const res = await api('admin').get(url);
        expect({ url, status: res.status }).toEqual({ url, status: 400 });
      }
      await api('a').patch('/api/reviews/3000000000').send({ status: 'resolved' }).expect(400);
      await api('a').patch(`/api/reviews/${fx.reviewA}`).send({ status: null }).expect(400);
      const [row] = await ds.query('SELECT status FROM reviews WHERE id = $1', [fx.reviewA]);
      expect(row.status).not.toBeNull();
    });
  });
});
