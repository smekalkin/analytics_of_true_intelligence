import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AccessScopeService } from '../access/access-scope.service';
import { AuthUser } from '../auth/auth-user';

export interface CompanyDto {
  id: number;
  name: string;
  branchesCount: number;
}

@Injectable()
export class CompaniesService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly access: AccessScopeService,
  ) {}

  async list(user: AuthUser): Promise<CompanyDto[]> {
    const scope = await this.access.resolve(user);
    const rows = await this.ds.query(
      `SELECT c.id, c.name, COUNT(b.id)::int AS "branchesCount"
         FROM companies c
         LEFT JOIN branches b ON b.company_id = c.id
        WHERE ($1::int IS NULL OR c.id = $1)
        GROUP BY c.id
        ORDER BY c.name`,
      [scope.companyId],
    );
    return rows;
  }

  async get(user: AuthUser, id: number): Promise<CompanyDto> {
    this.access.assertCompanyAccess(user, id);
    const [row] = await this.ds.query(
      `SELECT c.id, c.name, COUNT(b.id)::int AS "branchesCount"
         FROM companies c LEFT JOIN branches b ON b.company_id = c.id
        WHERE c.id = $1 GROUP BY c.id`,
      [id],
    );
    if (!row) throw new NotFoundException('Компания не найдена');
    return row;
  }
}
