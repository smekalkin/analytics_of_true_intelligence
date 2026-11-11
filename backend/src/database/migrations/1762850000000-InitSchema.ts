import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitSchema1762850000000 implements MigrationInterface {
  name = 'InitSchema1762850000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TYPE "user_role" AS ENUM ('admin', 'client')`);
    await q.query(`CREATE TYPE "review_status" AS ENUM ('new', 'in_progress', 'resolved')`);

    await q.query(`
      CREATE TABLE "companies" (
        "id"         SERIAL PRIMARY KEY,
        "name"       VARCHAR(200) NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);

    await q.query(`
      CREATE TABLE "users" (
        "id"            SERIAL PRIMARY KEY,
        "email"         VARCHAR(255) NOT NULL,
        "password_hash" VARCHAR(255) NOT NULL,
        "full_name"     VARCHAR(200) NOT NULL,
        "role"          "user_role"  NOT NULL,
        "company_id"    INT REFERENCES "companies"("id") ON DELETE CASCADE,
        "created_at"    TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "users_email_uq" UNIQUE ("email"),
        CONSTRAINT "users_role_company_chk" CHECK (
          ("role" = 'admin'  AND "company_id" IS NULL) OR
          ("role" = 'client' AND "company_id" IS NOT NULL)
        )
      )`);
    await q.query(`CREATE INDEX "users_company_idx" ON "users" ("company_id")`);

    await q.query(`
      CREATE TABLE "branches" (
        "id"         SERIAL PRIMARY KEY,
        "company_id" INT NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
        "name"       VARCHAR(200) NOT NULL,
        "city"       VARCHAR(100) NOT NULL,
        "address"    VARCHAR(300) NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);
    await q.query(`CREATE INDEX "branches_company_idx" ON "branches" ("company_id")`);

    await q.query(`
      CREATE TABLE "daily_metrics" (
        "id"             SERIAL PRIMARY KEY,
        "branch_id"      INT NOT NULL REFERENCES "branches"("id") ON DELETE CASCADE,
        "date"           DATE NOT NULL,
        "views"          INT NOT NULL DEFAULT 0 CHECK ("views" >= 0),
        "website_clicks" INT NOT NULL DEFAULT 0 CHECK ("website_clicks" >= 0),
        "calls"          INT NOT NULL DEFAULT 0 CHECK ("calls" >= 0),
        "routes"         INT NOT NULL DEFAULT 0 CHECK ("routes" >= 0),
        "rating"         NUMERIC(3,2) CHECK ("rating" BETWEEN 1 AND 5),
        "reviews_count"  INT NOT NULL DEFAULT 0 CHECK ("reviews_count" >= 0),
        "created_at"     TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"     TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "daily_metrics_branch_date_uq" UNIQUE ("branch_id", "date")
      )`);
    // Уникальный индекс (branch_id, date) уже покрывает выборки «филиал + период».
    await q.query(`CREATE INDEX "daily_metrics_date_idx" ON "daily_metrics" ("date")`);

    await q.query(`
      CREATE TABLE "reviews" (
        "id"           SERIAL PRIMARY KEY,
        "branch_id"    INT NOT NULL REFERENCES "branches"("id") ON DELETE CASCADE,
        "source"       VARCHAR(32) NOT NULL,
        "author_name"  VARCHAR(200) NOT NULL,
        "rating"       SMALLINT NOT NULL CHECK ("rating" BETWEEN 1 AND 5),
        "text"         TEXT NOT NULL,
        "status"       "review_status" NOT NULL DEFAULT 'new',
        "reply"        TEXT,
        "published_at" TIMESTAMPTZ NOT NULL,
        "processed_at" TIMESTAMPTZ,
        "created_at"   TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"   TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);
    await q.query(`CREATE INDEX "reviews_branch_published_idx" ON "reviews" ("branch_id", "published_at" DESC)`);
    await q.query(`CREATE INDEX "reviews_branch_status_idx" ON "reviews" ("branch_id", "status")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "reviews"`);
    await q.query(`DROP TABLE IF EXISTS "daily_metrics"`);
    await q.query(`DROP TABLE IF EXISTS "branches"`);
    await q.query(`DROP TABLE IF EXISTS "users"`);
    await q.query(`DROP TABLE IF EXISTS "companies"`);
    await q.query(`DROP TYPE IF EXISTS "review_status"`);
    await q.query(`DROP TYPE IF EXISTS "user_role"`);
  }
}
