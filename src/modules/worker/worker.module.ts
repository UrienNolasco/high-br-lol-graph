import { Module } from '@nestjs/common';
import { WorkerService } from './worker.service';
import { WorkerController } from './worker.controller';
import { RiotModule } from '../../core/riot/riot.module';
import { PrismaModule } from '../../core/prisma/prisma.module';

@Module({
  imports: [RiotModule, PrismaModule],
  controllers: [WorkerController],
  providers: [WorkerService],
  exports: [WorkerService],
})
export class WorkerModule {}
