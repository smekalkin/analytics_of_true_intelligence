import { Controller, Get, Query } from '@nestjs/common';
import { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators';
import { PeriodQueryDto } from '../common/scope-query.dto';
import { TimeseriesQueryDto } from './metrics.dto';
import { MetricsService } from './metrics.service';

@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get('summary')
  summary(@CurrentUser() user: AuthUser, @Query() q: PeriodQueryDto) {
    return this.metrics.summary(user, q);
  }

  @Get('timeseries')
  timeseries(@CurrentUser() user: AuthUser, @Query() q: TimeseriesQueryDto) {
    return this.metrics.timeseries(user, q);
  }

  @Get('by-branch')
  byBranch(@CurrentUser() user: AuthUser, @Query() q: PeriodQueryDto) {
    return this.metrics.byBranch(user, q);
  }
}
