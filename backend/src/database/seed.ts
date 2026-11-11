/**
 * Тестовые (полностью вымышленные) данные:
 *  - 3 компании, 7 филиалов;
 *  - 1 администратор + 3 клиента (по одному на компанию);
 *  - ежедневные показатели за последние 180 дней и отзывы, согласованные с ними.
 *
 * Запуск: `npm run seed` (пропускает, если данные уже есть) или `npm run seed:reset` (пересоздаёт).
 * Генерация детерминирована (фиксированный seed PRNG), даты отсчитываются от текущего дня.
 */
import * as bcrypt from 'bcryptjs';
import { DataSource, EntityManager } from 'typeorm';
import { addDays, todayUtc } from '../common/period';
import { dayFraction, generateDay } from '../mock-geo/mock-geo-server';
import { buildDataSourceOptions } from './data-source';
import { ReviewSource, ReviewStatus, UserRole } from './entities';

const HISTORY_DAYS = 180;

export const SEED_PASSWORDS = { admin: 'admin123', client: 'client123' };

type Profile = 'cafe' | 'auto' | 'dental';

interface BranchSeed {
  name: string;
  city: string;
  address: string;
  /** базовое число просмотров карточки в день */
  baseViews: number;
  /** стартовый рейтинг */
  baseRating: number;
  /** false — филиал не подключён к внешнему геосервису (вариант Б) */
  connected?: boolean;
}

interface CompanySeed {
  name: string;
  profile: Profile;
  client: { email: string; fullName: string };
  branches: BranchSeed[];
}

const COMPANIES: CompanySeed[] = [
  {
    name: 'Кофейня «Северный ветер»',
    profile: 'cafe',
    client: { email: 'veter@example.com', fullName: 'Анна Ветрова' },
    branches: [
      { name: 'Северный ветер — Центр', city: 'Москва', address: 'ул. Вымышленная, 1', baseViews: 420, baseRating: 4.7 },
      { name: 'Северный ветер — Парк', city: 'Москва', address: 'Тестовый бульвар, 15', baseViews: 260, baseRating: 4.5 },
      { name: 'Северный ветер — Вокзал', city: 'Тверь', address: 'пл. Примерная, 3', baseViews: 180, baseRating: 4.2 },
    ],
  },
  {
    name: 'Автосервис «Гайка»',
    profile: 'auto',
    client: { email: 'gaika@example.com', fullName: 'Пётр Гаечкин' },
    branches: [
      { name: 'Гайка на Промышленной', city: 'Казань', address: 'ул. Условная, 42', baseViews: 150, baseRating: 4.4 },
      { name: 'Гайка на Объездной', city: 'Казань', address: 'Объездное ш., 7к2', baseViews: 110, baseRating: 3.9, connected: false },
    ],
  },
  {
    name: 'Стоматология «Улыбка+»',
    profile: 'dental',
    client: { email: 'ulybka@example.com', fullName: 'Мария Зубова' },
    branches: [
      { name: 'Улыбка+ Невский', city: 'Санкт-Петербург', address: 'Демо-проспект, 100', baseViews: 200, baseRating: 4.8 },
      { name: 'Улыбка+ Купчино', city: 'Санкт-Петербург', address: 'ул. Образцовая, 9', baseViews: 130, baseRating: 4.6 },
    ],
  },
];

const ADMIN = { email: 'admin@example.com', fullName: 'Администратор системы' };

/** Конверсии из просмотров в действия по профилю бизнеса. */
const CONVERSION: Record<Profile, { site: number; calls: number; routes: number; weekend: number; reviewsPerView: number }> = {
  cafe: { site: 0.035, calls: 0.012, routes: 0.11, weekend: 1.35, reviewsPerView: 0.005 },
  auto: { site: 0.06, calls: 0.07, routes: 0.09, weekend: 0.7, reviewsPerView: 0.006 },
  dental: { site: 0.09, calls: 0.08, routes: 0.05, weekend: 0.6, reviewsPerView: 0.006 },
};

const AUTHORS = [
  'Алексей К.', 'Ирина С.', 'Дмитрий П.', 'Екатерина В.', 'Сергей М.', 'Ольга Н.', 'Никита Ж.', 'Татьяна Л.',
  'Виктор Б.', 'Юлия Р.', 'Андрей Г.', 'Наталья Ф.', 'Максим Ш.', 'Светлана Ц.', 'Роман Э.', 'Полина Я.',
];

const TEXTS: Record<Profile, Record<'good' | 'mid' | 'bad', string[]>> = {
  cafe: {
    good: ['Отличный капучино и уютная атмосфера!', 'Вежливый бариста, вкусные круассаны.', 'Любимое место для завтраков.', 'Быстро и вкусно, рекомендую.'],
    mid: ['Кофе хороший, но долго ждали заказ.', 'Нормально, но мало посадочных мест.', 'Вкусно, но цены выше среднего.'],
    bad: ['Кофе был холодный, персонал не извинился.', 'Грязные столы и долгое ожидание.', 'Перепутали заказ, неприятно.'],
  },
  auto: {
    good: ['Быстро поменяли масло, всё чётко.', 'Честная диагностика, не навязывали лишнего.', 'Мастера знают своё дело.'],
    mid: ['Сделали хорошо, но на час позже обещанного.', 'Нормальный сервис, но дороговато.', 'Работа ок, в зоне ожидания неуютно.'],
    bad: ['Не дозвонился, пришлось ехать лично.', 'Итоговая сумма сильно выше озвученной.', 'Машину вернули грязной.'],
  },
  dental: {
    good: ['Лечение без боли, врач — профессионал.', 'Очень внимательный персонал, спасибо!', 'Удобная запись и современное оборудование.'],
    mid: ['Врач хороший, но пришлось ждать 20 минут.', 'Качественно, но дорого.', 'Всё нормально, парковка неудобная.'],
    bad: ['Перенесли приём в последний момент.', 'Администратор была невежлива.', 'Пломба выпала через неделю.'],
  },
};

const REPLIES = ['Спасибо за отзыв! Рады, что вам понравилось.', 'Благодарим за обратную связь, передали руководителю филиала.', 'Приносим извинения, свяжемся с вами для решения вопроса.'];

/** Детерминированный PRNG (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Пуассоновская случайная величина (алгоритм Кнута, для малых λ). */
function poisson(rand: () => number, lambda: number): number {
  const l = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rand();
  } while (p > l);
  return k - 1;
}

function pick<T>(rand: () => number, list: readonly T[]): T {
  return list[Math.floor(rand() * list.length)];
}

/**
 * Распределение оценок 1..5 с весами exp(-|k-μ|·s); μ подбирается бинпоиском так,
 * чтобы матожидание совпало с целевым рейтингом филиала.
 */
function ratingDistribution(target: number, s = 1.8): number[] {
  const dist = (mu: number) => {
    const w = [1, 2, 3, 4, 5].map((k) => Math.exp(-Math.abs(k - mu) * s));
    const z = w.reduce((a, b) => a + b, 0);
    return w.map((x) => x / z);
  };
  const mean = (p: number[]) => p.reduce((acc, x, i) => acc + x * (i + 1), 0);
  let lo = 1;
  let hi = 10;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (mean(dist(mid)) < target) lo = mid;
    else hi = mid;
  }
  return dist(lo);
}

function drawRating(rand: () => number, dist: number[]): number {
  let x = rand();
  for (let k = 0; k < dist.length; k++) {
    x -= dist[k];
    if (x <= 0) return k + 1;
  }
  return 5;
}

function statusFor(rand: () => number, ageDays: number): ReviewStatus {
  if (ageDays > 21) return rand() < 0.92 ? ReviewStatus.Resolved : ReviewStatus.InProgress;
  if (ageDays > 5) return rand() < 0.5 ? ReviewStatus.Resolved : rand() < 0.6 ? ReviewStatus.InProgress : ReviewStatus.New;
  return rand() < 0.15 ? ReviewStatus.InProgress : ReviewStatus.New;
}

/** Многострочный параметризованный INSERT пачками (в рамках переданного менеджера/транзакции). */
async function insertChunked(em: EntityManager, table: string, rows: Record<string, unknown>[], chunk = 500) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  for (let i = 0; i < rows.length; i += chunk) {
    const part = rows.slice(i, i + chunk);
    const params: unknown[] = [];
    const values = part.map((row) => `(${cols.map((c) => `$${params.push(row[c])}`).join(', ')})`);
    await em.query(`INSERT INTO ${table} (${cols.join(', ')}) VALUES ${values.join(', ')}`, params);
  }
}

/** Ключ advisory-lock: несколько одновременно стартующих экземпляров не запустят сид дважды. */
const SEED_LOCK_KEY = 7_340_001;

export async function seed(ds: DataSource, opts: { reset?: boolean } = {}) {
  const today = todayUtc();
  const startDate = addDays(today, -(HISTORY_DAYS - 1));
  const [adminHash, clientHash] = await Promise.all([
    bcrypt.hash(SEED_PASSWORDS.admin, 10),
    bcrypt.hash(SEED_PASSWORDS.client, 10),
  ]);

  // Проверка «данные уже есть», очистка и вставка — в одной транзакции под блокировкой
  const seeded = await ds.transaction(async (tx) => {
    await tx.query('SELECT pg_advisory_xact_lock($1)', [SEED_LOCK_KEY]);
    if (opts.reset) {
      await tx.query('TRUNCATE sync_jobs, reviews, daily_metrics, branches, users, companies RESTART IDENTITY CASCADE');
    } else {
      const [{ count }] = await tx.query('SELECT COUNT(*)::int AS count FROM companies');
      if (count > 0) return false;
    }

    await tx.query(`INSERT INTO users (email, password_hash, full_name, role) VALUES ($1, $2, $3, $4)`, [
      ADMIN.email, adminHash, ADMIN.fullName, UserRole.Admin,
    ]);

    let branchSeq = 0;
    for (const c of COMPANIES) {
      const [{ id: companyId }] = await tx.query(`INSERT INTO companies (name) VALUES ($1) RETURNING id`, [c.name]);
      await tx.query(`INSERT INTO users (email, password_hash, full_name, role, company_id) VALUES ($1, $2, $3, $4, $5)`, [
        c.client.email, clientHash, c.client.fullName, UserRole.Client, companyId,
      ]);

      for (const b of c.branches) {
        branchSeq++;
        const [{ id: branchId }] = await tx.query(
          `INSERT INTO branches (company_id, name, city, address) VALUES ($1, $2, $3, $4) RETURNING id`,
          [companyId, b.name, b.city, b.address],
        );
        // Подключённые филиалы: история совпадает с тем, что отдаёт внешний API (как будто уже была загружена),
        // поэтому повторный импорт не создаёт расхождений. Неподключённый филиал — собственный генератор.
        const externalId = b.connected === false ? null : `loc-${String(branchId).padStart(5, '0')}`;
        if (externalId) await tx.query(`UPDATE branches SET external_id = $2 WHERE id = $1`, [branchId, externalId]);
        const seededAt = new Date();

        const rand = rng(1000 + branchSeq * 7919);
        const conv = CONVERSION[c.profile];
        const metrics: Record<string, unknown>[] = [];
        const reviews: Record<string, unknown>[] = [];
        // Рейтинг карточки — накопленное среднее, стартуем с «исторических» 80 отзывов.
        let ratingSum = b.baseRating * 80;
        let ratingCnt = 80;
        const trend = 0.0015 + (rand() - 0.5) * 0.003; // лёгкий рост/спад за период
        const ratingDist = ratingDistribution(b.baseRating);

        for (let i = 0; i < HISTORY_DAYS; i++) {
          const date = addDays(startDate, i);
          const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
          const isWeekend = dow === 0 || dow === 6;
          const noise = 0.8 + rand() * 0.4;
          const views = Math.round(b.baseViews * (1 + trend * i) * (isWeekend ? conv.weekend : 1) * noise);
          const binom = (p: number) => Math.max(0, Math.round(views * p * (0.75 + rand() * 0.5)));
          const ext = externalId ? generateDay(externalId, date, dayFraction(date, seededAt)) : null;

          const dayReviews = ext ? ext.new_reviews : poisson(rand, views * conv.reviewsPerView);
          const dayDist = ext?.rating ? ratingDistribution(ext.rating) : ratingDist;
          const ageDays = HISTORY_DAYS - 1 - i;
          for (let k = 0; k < dayReviews; k++) {
            const rating = drawRating(rand, dayDist);
            ratingSum += rating;
            ratingCnt++;
            const tone = rating >= 4 ? 'good' : rating === 3 ? 'mid' : 'bad';
            const status = statusFor(rand, ageDays);
            const publishedAt = new Date(`${date}T00:00:00Z`);
            publishedAt.setUTCHours(8 + Math.floor(rand() * 13), Math.floor(rand() * 60));
            if (publishedAt.getTime() > Date.now()) publishedAt.setTime(Math.max(Date.parse(`${date}T00:00:00Z`), Date.now() - 60_000));
            reviews.push({
              branch_id: branchId,
              source: pick<ReviewSource>(rand, ['yandex', 'yandex', '2gis', 'google']),
              author_name: pick(rand, AUTHORS),
              rating,
              text: pick(rand, TEXTS[c.profile][tone]),
              status,
              reply: status === ReviewStatus.Resolved ? REPLIES[tone === 'good' ? 0 : tone === 'mid' ? 1 : 2] : null,
              published_at: publishedAt,
              processed_at: status === ReviewStatus.Resolved ? new Date(publishedAt.getTime() + 86_400_000) : null,
            });
          }

          metrics.push(
            ext
              ? {
                  branch_id: branchId,
                  date,
                  views: ext.impressions,
                  website_clicks: ext.website_clicks,
                  calls: ext.phone_calls,
                  routes: ext.route_requests,
                  rating: ext.rating,
                  reviews_count: ext.new_reviews,
                }
              : {
                  branch_id: branchId,
                  date,
                  views,
                  website_clicks: binom(conv.site),
                  calls: binom(conv.calls),
                  routes: binom(conv.routes),
                  rating: Math.round((ratingSum / ratingCnt) * 100) / 100,
                  reviews_count: dayReviews,
                },
          );
        }

        await insertChunked(tx, 'daily_metrics', metrics);
        await insertChunked(tx, 'reviews', reviews);
      }
    }
    return true;
  });

  if (!seeded) {
    console.log('Данные уже есть — сид пропущен (используйте --reset для пересоздания).');
    return;
  }

  const [stats] = await ds.query(`SELECT
      (SELECT COUNT(*) FROM companies)::int AS companies,
      (SELECT COUNT(*) FROM branches)::int AS branches,
      (SELECT COUNT(*) FROM users)::int AS users,
      (SELECT COUNT(*) FROM daily_metrics)::int AS metrics,
      (SELECT COUNT(*) FROM reviews)::int AS reviews`);
  console.log('Сид выполнен:', stats);
  console.log(`Вход: ${ADMIN.email} / ${SEED_PASSWORDS.admin} (админ); ${COMPANIES.map((c) => c.client.email).join(', ')} / ${SEED_PASSWORDS.client}`);
}

if (require.main === module) {
  (async () => {
    const ds = await new DataSource(buildDataSourceOptions()).initialize();
    try {
      await seed(ds, { reset: process.argv.includes('--reset') });
    } finally {
      await ds.destroy();
    }
  })().catch((err) => {
    console.error('Ошибка сида:', err);
    process.exit(1);
  });
}
