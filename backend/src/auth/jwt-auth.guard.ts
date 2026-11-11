import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../database/entities';
import { AuthUser, JwtPayload } from './auth-user';
import { IS_PUBLIC_KEY } from './decorators';

/**
 * Глобальный guard: каждый запрос (кроме @Public) обязан содержать валидный Bearer-токен.
 * Роль и companyId перечитываются из БД, чтобы изменение прав вступало в силу сразу.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers?.authorization;
    const [scheme, token] = header?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException('Требуется авторизация');

    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Сессия истекла или токен недействителен');
    }

    const user = await this.users.findOne({ where: { id: Number(payload.sub) } });
    if (!user) throw new UnauthorizedException('Пользователь не найден');

    const authUser: AuthUser = { id: user.id, email: user.email, role: user.role, companyId: user.companyId };
    req.user = authUser;
    return true;
  }
}
