import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthUser } from '../auth/auth-user';
import { Branch, Company, UserRole } from '../database/entities';

/**
 * Итоговая область видимости запроса. `null` означает «без ограничения»
 * (допустимо только для администратора). Все сервисы обязаны фильтровать данные по ней.
 */
export interface DataScope {
  companyId: number | null;
  branchId: number | null;
}

export interface ScopeRequest {
  companyId?: number;
  branchId?: number;
}

/**
 * Единая точка серверной проверки прав доступа к данным.
 *  - администратор видит все компании, может сузить выборку до компании/филиала;
 *  - клиент всегда ограничен своей компанией; запрос чужой компании → 403,
 *    чужого филиала → 404 (не раскрываем факт существования).
 */
@Injectable()
export class AccessScopeService {
  constructor(@InjectRepository(Branch) private readonly branches: Repository<Branch>) {}

  async resolve(user: AuthUser, req: ScopeRequest = {}): Promise<DataScope> {
    let companyId: number | null = req.companyId ?? null;

    if (user.role !== UserRole.Admin) {
      if (user.companyId === null) throw new ForbiddenException('Пользователь не привязан к компании');
      if (companyId !== null && companyId !== user.companyId) {
        throw new ForbiddenException('Нет доступа к данным этой компании');
      }
      companyId = user.companyId;
    } else if (companyId !== null && !(await this.branches.manager.exists(Company, { where: { id: companyId } }))) {
      // Администратор запросил несуществующую компанию — 404 вместо «пустых» нулевых показателей
      throw new NotFoundException('Компания не найдена');
    }

    if (req.branchId === undefined || req.branchId === null) return { companyId, branchId: null };

    const branch = await this.branches.findOne({ where: { id: req.branchId }, select: { id: true, companyId: true } });
    if (!branch || (companyId !== null && branch.companyId !== companyId)) {
      throw new NotFoundException('Филиал не найден');
    }
    return { companyId: branch.companyId, branchId: branch.id };
  }

  /** Проверка доступа к конкретной компании (например, GET /companies/:id). */
  assertCompanyAccess(user: AuthUser, companyId: number): void {
    if (user.role === UserRole.Admin) return;
    if (user.companyId !== companyId) throw new ForbiddenException('Нет доступа к данным этой компании');
  }

  /** Проверка, что объект, принадлежащий филиалу companyId, виден пользователю. Иначе 404. */
  assertOwnedOrNotFound(user: AuthUser, ownerCompanyId: number, message = 'Объект не найден'): void {
    if (user.role === UserRole.Admin) return;
    if (user.companyId !== ownerCompanyId) throw new NotFoundException(message);
  }
}
