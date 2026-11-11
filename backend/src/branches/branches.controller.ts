import { Controller, Get, Param, Query } from '@nestjs/common';
import { IdParamPipe } from '../common/id-param.pipe';
import { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators';
import { ScopeQueryDto } from '../common/scope-query.dto';
import { BranchesService } from './branches.service';

@Controller('branches')
export class BranchesController {
  constructor(private readonly branches: BranchesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() q: ScopeQueryDto) {
    return this.branches.list(user, q);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', IdParamPipe) id: number) {
    return this.branches.get(user, id);
  }
}
