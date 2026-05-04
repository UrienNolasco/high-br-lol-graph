import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { RiotModule } from '../../core/riot/riot.module';
import { CollectorModule } from '../collector/collector.module';

@Module({
  imports: [RiotModule, CollectorModule],
  controllers: [AdminController],
})
export class AdminModule {}
