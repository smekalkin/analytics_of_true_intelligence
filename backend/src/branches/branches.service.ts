import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AccessScopeService, ScopeRequest } from '../access/access-scope.service';
import { AuthUser } from '../auth/auth-user';

export interface BranchDto {
  id: number;
  name: string;
  city: string;
  address: string;
  companyId: number;
  companyName: string;
  externalId: string | null;
}

const BRANCH_SELECT = `
  SELECT b.id, b.name, b.city, b.address, b.company_id AS "companyId", c.name AS "companyName", b.external_id AS "externalId"
    FROM branches b JOIN companies c ON c.id = b.company_id`;

@Injectable()
export class BranchesService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly access: AccessScopeService,
  ) {}

  async list(user: AuthUser, req: ScopeRequest): Promise<BranchDto[]> {
    const scope = await this.access.resolve(user, { companyId: req.companyId });
    return this.ds.query(`${BRANCH_SELECT} WHERE ($1::int IS NULL OR b.company_id = $1) ORDER BY c.name, b.name`, [
      scope.companyId,
    ]);
  }

  async get(user: AuthUser, id: number): Promise<BranchDto> {
    // resolve() бросит 404, если филиал не существует или принадлежит другой компании
    const scope = await this.access.resolve(user, { branchId: id });
    const [row] = await this.ds.query(`${BRANCH_SELECT} WHERE b.id = $1`, [scope.branchId]);
    return row;
  }
}
