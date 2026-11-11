import 'reflect-metadata';
import { DataSource, DataSourceOptions } from 'typeorm';
import { ENTITIES } from './entities';
import { InitSchema1762850000000 } from './migrations/1762850000000-InitSchema';
import { ExternalSync1762860000000 } from './migrations/1762860000000-ExternalSync';

export const MIGRATIONS = [InitSchema1762850000000, ExternalSync1762860000000];

export const DEFAULT_DATABASE_URL = 'postgres://analytics:analytics@localhost:5432/analytics';

export function buildDataSourceOptions(url = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL): DataSourceOptions {
  return {
    type: 'postgres',
    url,
    entities: ENTITIES,
    migrations: MIGRATIONS,
    synchronize: false,
    logging: process.env.DB_LOGGING === 'true',
  };
}

/** Используется TypeORM CLI: `npx typeorm-ts-node-commonjs -d src/database/data-source.ts migration:show` */
export default new DataSource(buildDataSourceOptions());
