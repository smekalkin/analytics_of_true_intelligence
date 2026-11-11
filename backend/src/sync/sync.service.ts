import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { AccessScopeService } from '../access/access-scope.service';
import { AuthUser } from '../auth/auth-user';
import { UserRole } from '../database/entities';
import { addDays, parseIsoDate, Period, todayUtc } from '../common/period';
import { ExternalDailyStat, GeoApiClient, GeoApiError } from './geo-api.client';
import { SyncJobsQueryDto, SyncRequestDto } from './sync.dto';

export const MAX_SYNC_DAYS = 93;
const DEFAULT_SYNC_DAYS = 7;
/** «Зависшая» синхронизация (процесс упал посреди работы) освобождает филиал через это время. */
const STALE_RUNNING_MINUTES = 10;

export type SyncStatus = 'running' | 'succeeded' | 'failed';

export interface SyncJobDto {
  id: number;
  branchId: number;
  branchName: string;
  companyId: number;
  from: string;
  to: string;
  status: SyncStatus;
  attempts: number;
  fetched: number | null;
  inserted: number | null;
  updated: number | null;
  unchanged: number | null;
  error: string | null;
  requestedBy: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface SyncResult {
  job: SyncJobDto;
  /** true — ответ повторён по Idempotency-Key, внешний API повторно не вызывался */
  replayed: boolean;
}

interface JobRow {
  id: number;
  branch_id: number;
  date_from: string;
  date_to: string;
  status: SyncStatus;
  requested_by: number | null;
}

const JOB_SELECT = `
  SELECT j.id, j.branch_id AS "branchId", b.name AS "branchName", b.company_id AS "companyId",
         to_char(j.date_from, 'YYYY-MM-DD') AS "from", to_char(j.date_to, 'YYYY-MM-DD') AS "to",
         j.status, j.attempts, j.fetched, j.inserted, j.updated, j.unchanged, j.error,
         u.email AS "requestedBy", u.role AS "requesterRole", j.started_at AS "startedAt", j.finished_at AS "finishedAt"
    FROM sync_jobs j
    JOIN branches b ON b.id = j.branch_id
    LEFT JOIN users u ON u.id = j.requested_by`;

const PG_UNIQUE_VIOLATION = '23505';

type JobSelectRow = SyncJobDto & { requesterRole: UserRole | null };

/** Клиенту не показываем email сотрудников платформы — только «Администратор». */
function toJobDto(row: JobSelectRow, viewer: AuthUser | null): SyncJobDto {
  const { requesterRole, ...job } = row;
  if (viewer && viewer.role !== UserRole.Admin && requesterRole === UserRole.Admin) job.requestedBy = 'Администратор';
  return job;
}

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly access: AccessScopeService,
    private readonly geo: GeoApiClient,
  ) {}

  /**
   * Загрузка статистики филиала из внешнего API.
   *
   * Повторные запросы обрабатываются на трёх уровнях:
   *  1. Idempotency-Key: тот же ключ + те же параметры → сохранённый результат без обращения к API;
   *     тот же ключ с другими параметрами → 422; ключ ещё в работе → 409.
   *  2. Параллельный запуск для филиала → 409 (частичный уникальный индекс, без гонок).
   *  3. Данные: upsert по (branch_id, date) — повторная загрузка не создаёт дублей,
   *     строки без изменений не перезаписываются.
   */
  async run(user: AuthUser, dto: SyncRequestDto, idempotencyKey?: string): Promise<SyncResult> {
    const scope = await this.access.resolve(user, { branchId: dto.branchId });
    const branchId = scope.branchId!;
    const period = resolveSyncPeriod(dto.from, dto.to);
    // Задача, «зависшая» после падения процесса, не должна вечно блокировать филиал и свой ключ
    await this.expireStale(branchId);

    if (idempotencyKey) {
      const existing = await this.findByKey(user.id, idempotencyKey);
      const replayed = existing && (await this.replay(user, existing, branchId, period));
      if (replayed) return replayed;
    }

    const [branch] = await this.ds.query(`SELECT id, external_id FROM branches WHERE id = $1`, [branchId]);
    if (!branch.external_id) throw new UnprocessableEntityException('Филиал не подключён к геосервису');

    let jobId: number;
    try {
      jobId = await this.startJob(branchId, period, user.id, idempotencyKey ?? null);
    } catch (err) {
      if (err?.code !== PG_UNIQUE_VIOLATION) throw err;
      // Гонка двух запросов с одним ключом: второй увидит запись первого
      if (err.constraint === 'sync_jobs_idempotency_uq' && idempotencyKey) {
        const existing = await this.findByKey(user.id, idempotencyKey);
        const replayed = existing && (await this.replay(user, existing, branchId, period));
        if (replayed) return replayed;
      }
      throw new ConflictException('Для этого филиала уже выполняется синхронизация. Дождитесь её завершения.');
    }

    await this.execute(jobId, branch.external_id, branchId, period);
    return { job: await this.getJob(jobId, user), replayed: false };
  }

  /** Системная синхронизация всех подключённых филиалов (CLI / планировщик). Ошибки не прерывают обход. */
  async syncAll(period: Period): Promise<SyncJobDto[]> {
    const branches: { id: number; external_id: string }[] = await this.ds.query(
      `SELECT id, external_id FROM branches WHERE external_id IS NOT NULL ORDER BY id`,
    );
    const results: SyncJobDto[] = [];
    for (const b of branches) {
      let jobId: number;
      try {
        jobId = await this.startJob(b.id, period, null, null);
      } catch (err) {
        if (err?.code === PG_UNIQUE_VIOLATION) {
          this.logger.warn(`Филиал ${b.id}: синхронизация уже выполняется — пропуск`);
          continue;
        }
        throw err;
      }
      await this.execute(jobId, b.external_id, b.id, period).catch(() => undefined);
      results.push(await this.getJob(jobId, null));
    }
    return results;
  }

  async listJobs(user: AuthUser, q: SyncJobsQueryDto): Promise<SyncJobDto[]> {
    const scope = await this.access.resolve(user, q);
    const rows = await this.ds.query(
      `${JOB_SELECT}
        WHERE ($1::int IS NULL OR b.company_id = $1) AND ($2::int IS NULL OR j.branch_id = $2)
        ORDER BY j.started_at DESC, j.id DESC
        LIMIT $3`,
      [scope.companyId, scope.branchId, q.limit ?? 20],
    );
    return rows.map((r: JobSelectRow) => toJobDto(r, user));
  }

  // ---------------------------------------------------------------------------

  private async expireStale(branchId: number): Promise<void> {
    await this.ds.query(
      `UPDATE sync_jobs SET status = 'failed', error = 'Прервано: превышено время выполнения', finished_at = now()
        WHERE branch_id = $1 AND status = 'running' AND started_at < now() - make_interval(mins => $2)`,
      [branchId, STALE_RUNNING_MINUTES],
    );
  }

  private async startJob(branchId: number, period: Period, userId: number | null, key: string | null): Promise<number> {
    await this.expireStale(branchId);
    const [row] = await this.ds.query(
      `INSERT INTO sync_jobs (branch_id, date_from, date_to, status, requested_by, idempotency_key)
       VALUES ($1, $2, $3, 'running', $4, $5) RETURNING id`,
      [branchId, period.from, period.to, userId, key],
    );
    return row.id;
  }

  /** Сходить во внешний API, записать данные и закрыть задачу. Сетевой вызов — вне транзакции БД. */
  private async execute(jobId: number, externalId: string, branchId: number, period: Period): Promise<void> {
    let attempts = 0;
    try {
      const res = await this.geo.fetchDailyStats(externalId, period.from, period.to);
      attempts = res.attempts;
      const counts = await this.ds.transaction((tx) => this.upsertMetrics(tx, branchId, res.items));
      await this.ds.query(
        `UPDATE sync_jobs SET status = 'succeeded', attempts = $2, fetched = $3, inserted = $4, updated = $5, unchanged = $6,
                finished_at = now() WHERE id = $1 AND status = 'running'`,
        [jobId, attempts, res.items.length, counts.inserted, counts.updated, counts.unchanged],
      );
      this.logger.log(`Синхронизация #${jobId} (${externalId} ${period.from}..${period.to}): ${JSON.stringify(counts)}`);
    } catch (err) {
      attempts = err instanceof GeoApiError ? err.attempts : attempts;
      const message = err instanceof GeoApiError ? err.message : 'Внутренняя ошибка при сохранении данных';
      if (!(err instanceof GeoApiError)) this.logger.error(`Синхронизация #${jobId}`, err);
      await this.ds.query(`UPDATE sync_jobs SET status = 'failed', attempts = $2, error = $3, finished_at = now() WHERE id = $1 AND status = 'running'`, [
        jobId,
        attempts,
        message,
      ]);
      throw new BadGatewayException({ message, jobId });
    }
  }

  /**
   * Идемпотентная запись: INSERT … ON CONFLICT (branch_id, date) DO UPDATE только если значения изменились.
   * RETURNING (xmax = 0) отличает вставку от обновления; не вернувшиеся строки — без изменений.
   */
  private async upsertMetrics(tx: EntityManager, branchId: number, items: ExternalDailyStat[]) {
    if (!items.length) return { inserted: 0, updated: 0, unchanged: 0 };
    const params: unknown[] = [];
    const values = items.map((it) => {
      const p = [branchId, it.date, it.views, it.websiteClicks, it.calls, it.routes, it.rating, it.reviewsCount].map(
        (v) => `$${params.push(v)}`,
      );
      return `(${p[0]}::int, ${p[1]}::date, ${p[2]}::int, ${p[3]}::int, ${p[4]}::int, ${p[5]}::int, ${p[6]}::numeric, ${p[7]}::int)`;
    });
    const rows: { inserted: boolean }[] = await tx.query(
      `INSERT INTO daily_metrics AS m (branch_id, date, views, website_clicks, calls, routes, rating, reviews_count)
       VALUES ${values.join(', ')}
       ON CONFLICT (branch_id, date) DO UPDATE SET
         views = EXCLUDED.views, website_clicks = EXCLUDED.website_clicks, calls = EXCLUDED.calls,
         routes = EXCLUDED.routes, rating = EXCLUDED.rating, reviews_count = EXCLUDED.reviews_count, updated_at = now()
       WHERE (m.views, m.website_clicks, m.calls, m.routes, m.rating, m.reviews_count)
             IS DISTINCT FROM
             (EXCLUDED.views, EXCLUDED.website_clicks, EXCLUDED.calls, EXCLUDED.routes, EXCLUDED.rating, EXCLUDED.reviews_count)
       RETURNING (xmax = 0) AS inserted`,
      params,
    );
    const inserted = rows.filter((r) => r.inserted).length;
    const updated = rows.length - inserted;
    return { inserted, updated, unchanged: items.length - rows.length };
  }

  private async findByKey(userId: number, key: string): Promise<JobRow | null> {
    const [row] = await this.ds.query(
      `SELECT id, branch_id, to_char(date_from, 'YYYY-MM-DD') AS date_from, to_char(date_to, 'YYYY-MM-DD') AS date_to,
              status, requested_by
         FROM sync_jobs WHERE requested_by = $1 AND idempotency_key = $2`,
      [userId, key],
    );
    return row ?? null;
  }

  /**
   * Повтор по Idempotency-Key. Возвращает null, если прошлая попытка с этим ключом завершилась ошибкой:
   * ключ освобождается, и запрос выполняется заново — клиент, повторяющий запрос после сбоя, получает
   * результат, а не сохранённую ошибку.
   */
  private async replay(user: AuthUser, existing: JobRow, branchId: number, period: Period): Promise<SyncResult | null> {
    if (existing.branch_id !== branchId || existing.date_from !== period.from || existing.date_to !== period.to) {
      throw new UnprocessableEntityException('Idempotency-Key уже использован для запроса с другими параметрами');
    }
    if (existing.status === 'running') {
      throw new ConflictException('Запрос с этим Idempotency-Key ещё выполняется');
    }
    if (existing.status === 'failed') {
      await this.ds.query(`UPDATE sync_jobs SET idempotency_key = NULL WHERE id = $1 AND status = 'failed'`, [existing.id]);
      return null;
    }
    return { job: await this.getJob(existing.id, user), replayed: true };
  }

  private async getJob(id: number, viewer: AuthUser | null): Promise<SyncJobDto> {
    const [row] = await this.ds.query(`${JOB_SELECT} WHERE j.id = $1`, [id]);
    return toJobDto(row, viewer);
  }
}

/** Период синхронизации: по умолчанию последние 7 дней; не длиннее 93 дней и не в будущем. */
export function resolveSyncPeriod(from?: string, to?: string): Period {
  const today = todayUtc();
  const resolvedTo = to ?? today;
  const resolvedFrom = from ?? addDays(resolvedTo, -(DEFAULT_SYNC_DAYS - 1));
  const days = Math.round((parseIsoDate(resolvedTo).getTime() - parseIsoDate(resolvedFrom).getTime()) / 86_400_000) + 1;
  if (days < 1) throw new BadRequestException('Дата начала периода позже даты окончания');
  if (days > MAX_SYNC_DAYS) throw new BadRequestException(`За один запрос можно загрузить не более ${MAX_SYNC_DAYS} дней`);
  if (resolvedTo > today) throw new BadRequestException('Нельзя загрузить данные за будущие даты');
  return { from: resolvedFrom, to: resolvedTo, days };
}
