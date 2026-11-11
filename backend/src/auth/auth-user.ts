import { UserRole } from '../database/entities';

/** Пользователь, прикреплённый к запросу после проверки JWT. Роль и компания берутся из БД, не из токена. */
export interface AuthUser {
  id: number;
  email: string;
  role: UserRole;
  companyId: number | null;
}

export interface JwtPayload {
  sub: number;
}
