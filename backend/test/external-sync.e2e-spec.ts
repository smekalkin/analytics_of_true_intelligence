/**
 * E2E (вариант Б): получение статистики из внешнего API, сохранение в БД
 * и корректная обработка повторных запросов. Мок геосервиса поднимается в этом же процессе.
 */
import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { todayUtc } from '../src/common/period';
import { MockGeoServer } from '../src/mock-geo/mock-geo-server';
import { createTestApp, login, openTestDatabase } from './helpers';

const PASSWORD = 'secret-pass';
const API_KEY = 'test-geo-key';

describe('Импорт статистики из внешнего API (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let mock: MockGeoServer;
  let mockNow = new Date();
  let branchA1: number;
  let branchA2NotConnected: number;
  let branchB1: number;
  let companyB: number;
  const tokens = { admin: '', a: '' };

  const post = (who: keyof typeof tokens, body: object, key?: string) => {
    const req = request(app.getHttpServer()).post('/api/sync').set('Authorization', `Bearer ${tokens[who]}`);
    if (key) req.set('Idempotency-Key', key);
    return req.send(body);
  };
  const get = (who: keyof typeof tokens, url: string) =>
    request(app.getHttpServer()).get(url).set('Authorization', `Bearer ${tokens[who]}`);
  const countRows = async (branchId: number, from: string, to: string) =>
    (await ds.query(`SELECT COUNT(*)::int AS c FROM daily_metrics WHERE branch_id = $1 AND date BETWEEN $2 AND $3`, [branchId, from, to]))[0].c;

  beforeAll(async () => {
    mock = new MockGeoServer({ apiKey: API_KEY, failureRate: 0, now: () => mockNow });
    const port = await mock.listen(0);
    process.env.GEO_API_URL = `http://127.0.0.1:${port}`;
    process.env.GEO_API_KEY = API_KEY;
    process.env.GEO_API_RETRY_BASE_MS = '5';
    process.env.GEO_API_TIMEOUT_MS = '2000';

    ds = await openTestDatabase();
    const hash = await bcrypt.hash(PASSWORD, 4);
    const [{ id: companyA }] = await ds.query(`INSERT INTO companies (name) VALUES ('A') RETURNING id`);
    [{ id: companyB }] = await ds.query(`INSERT INTO companies (name) VALUES ('B') RETURNING id`);
    await ds.query(
      `INSERT INTO users (email, password_hash, full_name, role, company_id) VALUES
         ('admin@test.local', $1, 'Админ', 'admin', NULL), ('a@test.local', $1, 'Клиент A', 'client', $2)`,
      [hash, companyA],
    );
    const branch = async (companyId: number, name: string, externalId: string | null) =>
      (
        await ds.query(`INSERT INTO branches (company_id, name, city, address, external_id) VALUES ($1, $2, 'Город', 'Адрес', $3) RETURNING id`, [
          companyId,
          name,
          externalId,
        ])
      )[0].id as number;
    branchA1 = await branch(companyA, 'A-1', 'loc-00001');
    branchA2NotConnected = await branch(companyA, 'A-2', null);
    branchB1 = await branch(companyB, 'B-1', 'loc-00002');

    app = await createTestApp();
    tokens.admin = await login(app, 'admin@test.local', PASSWORD);
    tokens.a = await login(app, 'a@test.local', PASSWORD);
  });

  afterAll(async () => {
    await app?.close();
    await ds?.destroy();
    await mock?.close();
  });

  describe('сохранение и повторная загрузка данных', () => {
    const period = { from: '2026-01-01', to: '2026-01-07' };

    it('первая загрузка сохраняет все дни периода', async () => {
      const res = await post('a', { branchId: branchA1, ...period }).expect(201);
      expect(res.body.replayed).toBe(false);
      expect(res.body.job).toMatchObject({ status: 'succeeded', attempts: 1, fetched: 7, inserted: 7, updated: 0, unchanged: 0, ...period });
      expect(await countRows(branchA1, period.from, period.to)).toBe(7);

      // Данные в БД соответствуют ответу внешнего API (с маппингом полей)
      const [row] = await ds.query(`SELECT views, website_clicks, calls, routes, rating::float AS rating, reviews_count
                                      FROM daily_metrics WHERE branch_id = $1 AND date = '2026-01-03'`, [branchA1]);
      const { generateDay } = await import('../src/mock-geo/mock-geo-server');
      const ext = generateDay('loc-00001', '2026-01-03');
      expect(row).toEqual({
        views: ext.impressions,
        website_clicks: ext.website_clicks,
        calls: ext.phone_calls,
        routes: ext.route_requests,
        rating: ext.rating,
        reviews_count: ext.new_reviews,
      });
    });

    it('повторная загрузка того же периода не создаёт дублей и не перезаписывает строки', async () => {
      const before = await ds.query(`SELECT id, updated_at FROM daily_metrics WHERE branch_id = $1 ORDER BY date`, [branchA1]);
      const res = await post('a', { branchId: branchA1, ...period }).expect(201);
      expect(res.body.job).toMatchObject({ status: 'succeeded', fetched: 7, inserted: 0, updated: 0, unchanged: 7 });
      const after = await ds.query(`SELECT id, updated_at FROM daily_metrics WHERE branch_id = $1 ORDER BY date`, [branchA1]);
      expect(after).toEqual(before);
    });

    it('расхождения с источником исправляются, остальные строки не трогаются', async () => {
      await ds.query(`UPDATE daily_metrics SET views = 0 WHERE branch_id = $1 AND date IN ('2026-01-02', '2026-01-05')`, [branchA1]);
      const res = await post('a', { branchId: branchA1, ...period }).expect(201);
      expect(res.body.job).toMatchObject({ inserted: 0, updated: 2, unchanged: 5 });
    });

    it('перекрывающийся период: новые дни добавляются, существующие остаются', async () => {
      const res = await post('a', { branchId: branchA1, from: '2026-01-05', to: '2026-01-10' }).expect(201);
      expect(res.body.job).toMatchObject({ fetched: 6, inserted: 3, updated: 0, unchanged: 3 });
      expect(await countRows(branchA1, '2026-01-01', '2026-01-10')).toBe(10);
    });

    it('неполные данные за сегодня обновляются при следующей загрузке', async () => {
      const today = todayUtc();
      const body = { branchId: branchA1, from: today, to: today };
      mockNow = new Date(`${today}T06:00:00Z`);
      expect((await post('a', body).expect(201)).body.job).toMatchObject({ inserted: 1 });
      mockNow = new Date(`${today}T18:00:00Z`);
      expect((await post('a', body).expect(201)).body.job).toMatchObject({ inserted: 0, updated: 1 });
      expect((await post('a', body).expect(201)).body.job).toMatchObject({ updated: 0, unchanged: 1 });
      mockNow = new Date();
    });
  });

  describe('Idempotency-Key', () => {
    const body = () => ({ branchId: branchA1, from: '2026-02-01', to: '2026-02-03' });

    it('повтор с тем же ключом возвращает сохранённый результат без обращения к внешнему API', async () => {
      const first = await post('a', body(), 'key-replay-0001').expect(201);
      const calls = mock.requestCount;

      const second = await post('a', body(), 'key-replay-0001').expect(200);
      expect(second.headers['idempotent-replayed']).toBe('true');
      expect(second.body.replayed).toBe(true);
      expect(second.body.job).toEqual(first.body.job);
      expect(mock.requestCount).toBe(calls);

      const jobs = await ds.query(`SELECT COUNT(*)::int AS c FROM sync_jobs WHERE idempotency_key = 'key-replay-0001'`);
      expect(jobs[0].c).toBe(1);
    });

    it('тот же ключ с другими параметрами → 422', async () => {
      await post('a', { ...body(), to: '2026-02-04' }, 'key-replay-0001').expect(422);
    });

    it('ключи изолированы между пользователями', async () => {
      const res = await post('admin', body(), 'key-replay-0001').expect(201);
      expect(res.body.replayed).toBe(false);
    });

    it('некорректный формат ключа → 400', async () => {
      await post('a', body(), 'short').expect(400);
    });
  });

  describe('параллельные запросы', () => {
    afterEach(() => mock.setLatency(0));

    it('одновременно может выполняться только одна синхронизация филиала', async () => {
      mock.setLatency(300);
      const statuses = await Promise.all([
        post('a', { branchId: branchA1, from: '2026-03-01', to: '2026-03-02' }, 'parallel-key-a'),
        new Promise((r) => setTimeout(r, 50)).then(() => post('a', { branchId: branchA1, from: '2026-03-01', to: '2026-03-02' }, 'parallel-key-b')),
      ]).then((rs) => rs.map((r) => r.status).sort());
      expect(statuses).toEqual([201, 409]);
    });

    it('двойная отправка с одним ключом выполняет работу один раз', async () => {
      mock.setLatency(300);
      const calls = mock.requestCount;
      const body = { branchId: branchA1, from: '2026-03-03', to: '2026-03-04' };
      const [r1, r2] = await Promise.all([
        post('a', body, 'double-submit-1'),
        new Promise((r) => setTimeout(r, 50)).then(() => post('a', body, 'double-submit-1')),
      ]);
      expect([r1.status, r2.status].sort()).toEqual([201, 409]);
      expect(mock.requestCount).toBe(calls + 1);
      // После завершения тот же ключ отдаёт сохранённый результат
      const r3 = await post('a', body, 'double-submit-1').expect(200);
      expect(r3.body.job.id).toBe((r1.status === 201 ? r1 : r2).body.job.id);
    });

    it('разные филиалы синхронизируются параллельно', async () => {
      mock.setLatency(200);
      const [r1, r2] = await Promise.all([
        post('admin', { branchId: branchA1, from: '2026-03-05', to: '2026-03-05' }),
        post('admin', { branchId: branchB1, from: '2026-03-05', to: '2026-03-05' }),
      ]);
      expect([r1.status, r2.status]).toEqual([201, 201]);
    });
  });

  describe('сбои внешнего API', () => {
    it('временные ошибки 503 переживаются ретраями', async () => {
      mock.failNext(2, 503);
      const res = await post('a', { branchId: branchA1, from: '2026-04-01', to: '2026-04-02' }).expect(201);
      expect(res.body.job).toMatchObject({ status: 'succeeded', attempts: 3, inserted: 2 });
    });

    it('исчерпание попыток → 502, задача failed, данные не записаны, филиал не заблокирован', async () => {
      mock.failNext(4, 503); // ровно столько, сколько попыток делает клиент
      const res = await post('a', { branchId: branchA1, from: '2026-04-10', to: '2026-04-12' }).expect(502);
      expect(res.body.message).toMatch(/недоступен после 4 попыток/);
      expect(await countRows(branchA1, '2026-04-10', '2026-04-12')).toBe(0);

      const [job] = await ds.query(`SELECT status, attempts FROM sync_jobs WHERE id = $1`, [res.body.jobId]);
      expect(job).toEqual({ status: 'failed', attempts: 4 });

      await post('a', { branchId: branchA1, from: '2026-04-10', to: '2026-04-12' }).expect(201);
    });

    it('после ошибки повтор с тем же ключом выполняет запрос заново, а не возвращает сохранённую ошибку', async () => {
      const body = { branchId: branchA1, from: '2026-04-20', to: '2026-04-21' };
      mock.failNext(4, 503);
      const failed = await post('a', body, 'retry-after-fail-1').expect(502);

      const retried = await post('a', body, 'retry-after-fail-1').expect(201);
      expect(retried.body).toMatchObject({ replayed: false, job: { status: 'succeeded', inserted: 2 } });
      expect(retried.body.job.id).not.toBe(failed.body.jobId);

      // Теперь ключ закреплён за успешной задачей — дальше обычный повтор
      const replay = await post('a', body, 'retry-after-fail-1').expect(200);
      expect(replay.body.job.id).toBe(retried.body.job.id);
    });

    it('некорректный ответ API отклоняется целиком (ни одной строки не записано)', async () => {
      mock.corruptNext();
      const res = await post('a', { branchId: branchA1, from: '2026-05-01', to: '2026-05-05' }).expect(502);
      expect(res.body.message).toMatch(/Некорректный ответ внешнего API/);
      expect(await countRows(branchA1, '2026-05-01', '2026-05-05')).toBe(0);
    });
  });

  describe('права и валидация', () => {
    it('клиент не может синхронизировать чужой филиал и видеть чужие задачи', async () => {
      await post('a', { branchId: branchB1 }).expect(404);
      await get('a', `/api/sync/jobs?companyId=${companyB}`).expect(403);
      const jobs = await get('a', '/api/sync/jobs?limit=100').expect(200);
      expect(jobs.body.length).toBeGreaterThan(0);
      expect(jobs.body.every((j: { branchId: number }) => j.branchId !== branchB1)).toBe(true);

      // Запуски администратора видны клиенту, но без email сотрудника платформы
      const requesters = new Set(jobs.body.map((j: { requestedBy: string }) => j.requestedBy));
      expect(requesters.has('Администратор')).toBe(true);
      expect(requesters.has('admin@test.local')).toBe(false);
      const asAdmin = await get('admin', '/api/sync/jobs?limit=100').expect(200);
      expect(asAdmin.body.some((j: { requestedBy: string }) => j.requestedBy === 'admin@test.local')).toBe(true);
    });

    it('филиал без подключения к геосервису → 422', async () => {
      await post('a', { branchId: branchA2NotConnected }).expect(422);
    });

    it('некорректный период → 400', async () => {
      await post('a', { branchId: branchA1, from: '2025-01-01', to: '2025-12-31' }).expect(400);
      await post('a', { branchId: branchA1, from: '2099-01-01', to: '2099-01-02' }).expect(400);
      await post('a', {}).expect(400);
    });

    it('branchId — только целое число в допустимом диапазоне', async () => {
      await post('a', { branchId: true }).expect(400);
      await post('a', { branchId: '1' }).expect(400);
      await post('a', { branchId: 3_000_000_000 }).expect(400);
    });
  });
});
