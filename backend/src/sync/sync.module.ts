import { Module } from '@nestjs/common';
import { GeoApiClient } from './geo-api.client';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';

@Module({ controllers: [SyncController], providers: [SyncService, GeoApiClient], exports: [SyncService] })
export class SyncModule {}
