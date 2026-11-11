import { Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';

/** Значения из примеров и старых конфигов — ими подписать токен может кто угодно. */
const KNOWN_WEAK_SECRETS = new Set(['dev-only-secret-change-me', 'change-me-in-production', 'secret', 'changeme', 'jwt-secret']);
export const MIN_SECRET_LENGTH = 32;

/**
 * Выбор ключа подписи JWT:
 *  - не задан → случайный ключ на время жизни процесса (сессии сбросятся при перезапуске) — безопасно по умолчанию;
 *  - известный или короткий ключ → в production отказ запуска, в остальных средах предупреждение.
 */
export function resolveJwtSecret(configured: string | undefined, nodeEnv: string | undefined): string {
  const logger = new Logger('JwtSecret');
  const secret = configured?.trim();
  if (!secret) {
    logger.warn('JWT_SECRET не задан — сгенерирован случайный ключ; после перезапуска потребуется повторный вход');
    return randomBytes(48).toString('base64url');
  }
  const weak = KNOWN_WEAK_SECRETS.has(secret) || secret.length < MIN_SECRET_LENGTH;
  if (weak && nodeEnv === 'production') {
    throw new Error(
      `JWT_SECRET небезопасен (известное значение или короче ${MIN_SECRET_LENGTH} символов). ` +
        'Задайте случайный ключ, например: openssl rand -base64 48',
    );
  }
  if (weak) logger.warn(`JWT_SECRET короче ${MIN_SECRET_LENGTH} символов или общеизвестен — допустимо только для разработки`);
  return secret;
}
