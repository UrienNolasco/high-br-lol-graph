import { Module } from '@nestjs/common';
import { WorkerService } from './worker.service';
import { WorkerController } from './worker.controller';
import { RiotModule } from '../../core/riot/riot.module';
import { PrismaModule } from '../../core/prisma/prisma.module';
import { SemaphoreModule } from '../../core/semaphore/semaphore.module';

@Module({
  imports: [RiotModule, PrismaModule, SemaphoreModule],
  controllers: [WorkerController],
  providers: [WorkerService],
  exports: [WorkerService],
})
export class WorkerModule {}
