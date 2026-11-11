import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { AuthUser } from '../auth/auth-user';
import { Branch, UserRole } from '../database/entities';
import { AccessScopeService } from './access-scope.service';

/** Unit-тест политики доступа без БД: репозиторий филиалов подменён in-memory заглушкой. */
describe('AccessScopeService', () => {
  const branches: Pick<Branch, 'id' | 'companyId'>[] = [
    { id: 10, companyId: 1 },
    { id: 11, companyId: 1 },
    { id: 20, companyId: 2 },
  ];
  const companies = [1, 2];
  const repo = {
    findOne: jest.fn(async ({ where: { id } }: { where: { id: number } }) => branches.find((b) => b.id === id) ?? null),
    manager: { exists: jest.fn(async (_: unknown, { where: { id } }: { where: { id: number } }) => companies.includes(id)) },
  } as unknown as Repository<Branch>;
  const service = new AccessScopeService(repo);

  const admin: AuthUser = { id: 1, email: 'a@x', role: UserRole.Admin, companyId: null };
  const clientA: AuthUser = { id: 2, email: 'c@x', role: UserRole.Client, companyId: 1 };

  it('клиент без параметров ограничен своей компанией', async () => {
    await expect(service.resolve(clientA)).resolves.toEqual({ companyId: 1, branchId: null });
  });

  it('клиент не может запросить чужую компанию (403)', async () => {
    await expect(service.resolve(clientA, { companyId: 2 })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('клиент не может запросить филиал чужой компании (404)', async () => {
    await expect(service.resolve(clientA, { branchId: 20 })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('клиент получает свой филиал', async () => {
    await expect(service.resolve(clientA, { branchId: 11 })).resolves.toEqual({ companyId: 1, branchId: 11 });
  });

  it('несуществующий филиал → 404', async () => {
    await expect(service.resolve(admin, { branchId: 999 })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('администратор без фильтров видит всё', async () => {
    await expect(service.resolve(admin)).resolves.toEqual({ companyId: null, branchId: null });
  });

  it('администратор: несовпадение companyId и branchId → 404', async () => {
    await expect(service.resolve(admin, { companyId: 1, branchId: 20 })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('администратор: несуществующая компания → 404', async () => {
    await expect(service.resolve(admin, { companyId: 99 })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('клиент без компании не получает доступ ни к чему', async () => {
    const orphan: AuthUser = { ...clientA, companyId: null };
    await expect(service.resolve(orphan)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
