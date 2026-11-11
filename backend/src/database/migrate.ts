import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from './data-source';

async function main() {
  const ds = await new DataSource(buildDataSourceOptions()).initialize();
  try {
    const applied = await ds.runMigrations({ transaction: 'each' });
    console.log(applied.length ? `Применены миграции: ${applied.map((m) => m.name).join(', ')}` : 'Новых миграций нет');
  } finally {
    await ds.destroy();
  }
}

main().catch((err) => {
  console.error('Ошибка миграции:', err);
  process.exit(1);
});
