// Выполняется до импорта модулей в e2e-тестах: направляем приложение в отдельную тестовую БД.
process.env.DATABASE_URL =
  process.env.DATABASE_URL_TEST ?? 'postgres://analytics:analytics@localhost:5432/analytics_test';
process.env.JWT_SECRET = 'e2e-test-secret';
process.env.TZ = 'UTC';
