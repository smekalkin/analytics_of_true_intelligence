import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Branch } from '../database/entities';
import { AccessScopeService } from './access-scope.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Branch])],
  providers: [AccessScopeService],
  exports: [AccessScopeService],
})
export class AccessModule {}
