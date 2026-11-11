/**
 * Пакетная синхронизация всех подключённых филиалов — для запуска по расписанию (cron / k8s CronJob).
 *   npm run sync:all -- --days 3
 *   docker compose exec backend node dist/sync/sync-all.js --days 3
 */
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { MAX_SYNC_DAYS, resolveSyncPeriod, SyncService } from './sync.service';
import { addDays, todayUtc } from '../common/period';

async function main() {
  const idx = process.argv.indexOf('--days');
  const days = idx > 0 ? Number(process.argv[idx + 1]) : 2;
  if (!Number.isInteger(days) || days < 1 || days > MAX_SYNC_DAYS) {
    console.error(`--days должен быть целым числом от 1 до ${MAX_SYNC_DAYS}`);
    process.exit(2);
  }
  const to = todayUtc();
  const period = resolveSyncPeriod(addDays(to, -(days - 1)), to);

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['log', 'warn', 'error'] });
  try {
    const jobs = await app.get(SyncService).syncAll(period);
    for (const j of jobs) {
      Logger.log(
        `${j.branchName}: ${j.status}` +
          (j.status === 'succeeded' ? ` (+${j.inserted} / ~${j.updated} / =${j.unchanged}, попыток: ${j.attempts})` : ` — ${j.error}`),
        'sync:all',
      );
    }
    if (jobs.some((j) => j.status === 'failed')) process.exitCode = 1;
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
