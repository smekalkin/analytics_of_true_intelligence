import { Controller, Get, Param } from '@nestjs/common';
import { IdParamPipe } from '../common/id-param.pipe';
import { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators';
import { CompaniesService } from './companies.service';

@Controller('companies')
export class CompaniesController {
  constructor(private readonly companies: CompaniesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.companies.list(user);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', IdParamPipe) id: number) {
    return this.companies.get(user, id);
  }
}
