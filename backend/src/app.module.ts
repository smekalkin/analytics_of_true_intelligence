import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccessModule } from './access/access.module';
import { AuthModule } from './auth/auth.module';
import { BranchesModule } from './branches/branches.module';
import { CompaniesModule } from './companies/companies.module';
import { buildDataSourceOptions, DEFAULT_DATABASE_URL } from './database/data-source';
import { HealthController } from './health/health.controller';
import { MetricsModule } from './metrics/metrics.module';
import { ReviewsModule } from './reviews/reviews.module';
import { SyncModule } from './sync/sync.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => buildDataSourceOptions(config.get('DATABASE_URL', DEFAULT_DATABASE_URL)),
    }),
    AccessModule,
    AuthModule,
    CompaniesModule,
    BranchesModule,
    MetricsModule,
    ReviewsModule,
    SyncModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
