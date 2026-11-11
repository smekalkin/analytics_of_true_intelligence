import { BadRequestException, Body, Controller, Get, Headers, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators';
import { SyncJobsQueryDto, SyncRequestDto } from './sync.dto';
import { SyncService } from './sync.service';

const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9_\-:.]{8,100}$/;

@Controller('sync')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  /**
   * Загрузить статистику филиала из внешнего геосервиса.
   * 201 — новая синхронизация, 200 — повтор по Idempotency-Key (заголовок Idempotent-Replayed: true).
   */
  @Post()
  async run(
    @CurrentUser() user: AuthUser,
    @Body() dto: SyncRequestDto,
    @Headers('idempotency-key') key: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (key !== undefined && !IDEMPOTENCY_KEY_RE.test(key)) {
      throw new BadRequestException('Idempotency-Key: 8–100 символов [A-Za-z0-9_-:.]');
    }
    const result = await this.sync.run(user, dto, key);
    res.status(result.replayed ? 200 : 201);
    if (result.replayed) res.setHeader('Idempotent-Replayed', 'true');
    return result;
  }

  @Get('jobs')
  jobs(@CurrentUser() user: AuthUser, @Query() q: SyncJobsQueryDto) {
    return this.sync.listJobs(user, q);
  }
}
