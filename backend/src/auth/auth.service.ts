import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { Repository } from 'typeorm';
import { User, UserRole } from '../database/entities';
import { AuthUser, JwtPayload } from './auth-user';

/** Хеш случайной строки со стоимостью 10 (как у настоящих паролей) — для выравнивания времени ответа. */
const DUMMY_HASH = bcrypt.hashSync(`dummy-${Math.random()}`, 10);

export interface PublicUser {
  id: number;
  email: string;
  fullName: string;
  role: UserRole;
  companyId: number | null;
  companyName: string | null;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly jwt: JwtService,
  ) {}

  async login(email: string, password: string): Promise<{ accessToken: string; user: PublicUser }> {
    const user = await this.users
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .leftJoinAndSelect('u.company', 'c')
      .where('u.email = :email', { email: email.trim().toLowerCase() })
      .getOne();

    // Не раскрываем существование email: одинаковое сообщение и одинаковое время ответа —
    // для неизвестного email bcrypt всё равно выполняется (с фиктивным хешем той же стоимости).
    const passwordOk = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !passwordOk) {
      throw new UnauthorizedException('Неверный email или пароль');
    }

    const payload: JwtPayload = { sub: user.id };
    return { accessToken: await this.jwt.signAsync(payload), user: this.toPublic(user) };
  }

  async me(authUser: AuthUser): Promise<PublicUser> {
    const user = await this.users.findOneOrFail({ where: { id: authUser.id }, relations: { company: true } });
    return this.toPublic(user);
  }

  private toPublic(user: User): PublicUser {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      companyId: user.companyId,
      companyName: user.company?.name ?? null,
    };
  }
}
