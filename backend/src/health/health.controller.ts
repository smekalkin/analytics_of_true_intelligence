import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Public } from '../auth/decorators';

@Controller('health')
export class HealthController {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  @Public()
  @Get()
  async check() {
    try {
      await this.ds.query('SELECT 1');
      return { status: 'ok' };
    } catch {
      throw new ServiceUnavailableException('База данных недоступна');
    }
  }
}
