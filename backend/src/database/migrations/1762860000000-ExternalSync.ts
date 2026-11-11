import { MigrationInterface, QueryRunner } from 'typeorm';

/** Вариант Б: привязка филиалов к внешнему геосервису и журнал синхронизаций. */
export class ExternalSync1762860000000 implements MigrationInterface {
  name = 'ExternalSync1762860000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "branches" ADD COLUMN "external_id" VARCHAR(64)`);
    await q.query(`ALTER TABLE "branches" ADD CONSTRAINT "branches_external_id_uq" UNIQUE ("external_id")`);
    // Уже существующие филиалы подключаем к имитации геосервиса
    await q.query(`UPDATE "branches" SET "external_id" = 'loc-' || lpad("id"::text, 5, '0') WHERE "external_id" IS NULL`);

    await q.query(`CREATE TYPE "sync_status" AS ENUM ('running', 'succeeded', 'failed')`);
    await q.query(`
      CREATE TABLE "sync_jobs" (
        "id"              SERIAL PRIMARY KEY,
        "branch_id"       INT NOT NULL REFERENCES "branches"("id") ON DELETE CASCADE,
        "date_from"       DATE NOT NULL,
        "date_to"         DATE NOT NULL,
        "status"          "sync_status" NOT NULL DEFAULT 'running',
        "idempotency_key" VARCHAR(100),
        "requested_by"    INT REFERENCES "users"("id") ON DELETE SET NULL,
        "attempts"        INT NOT NULL DEFAULT 0,
        "fetched"         INT,
        "inserted"        INT,
        "updated"         INT,
        "unchanged"       INT,
        "error"           TEXT,
        "started_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
        "finished_at"     TIMESTAMPTZ,
        CONSTRAINT "sync_jobs_period_chk" CHECK ("date_from" <= "date_to"),
        CONSTRAINT "sync_jobs_idempotency_uq" UNIQUE ("requested_by", "idempotency_key")
      )`);
    // Не больше одной активной синхронизации на филиал — гарантия на уровне БД, без гонок
    await q.query(`CREATE UNIQUE INDEX "sync_jobs_one_running_per_branch" ON "sync_jobs" ("branch_id") WHERE "status" = 'running'`);
    await q.query(`CREATE INDEX "sync_jobs_branch_started_idx" ON "sync_jobs" ("branch_id", "started_at" DESC)`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "sync_jobs"`);
    await q.query(`DROP TYPE IF EXISTS "sync_status"`);
    await q.query(`ALTER TABLE "branches" DROP CONSTRAINT IF EXISTS "branches_external_id_uq"`);
    await q.query(`ALTER TABLE "branches" DROP COLUMN IF EXISTS "external_id"`);
  }
}
