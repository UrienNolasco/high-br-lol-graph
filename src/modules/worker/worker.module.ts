import { Module } from '@nestjs/common';
import { WorkerService } from './services/worker.service';
import { WorkerController } from './worker.controller';
import { ProcessingModule } from '../processing/processing.module';

@Module({
  imports: [
    ProcessingModule,
  ],
  controllers: [WorkerController],
  providers: [WorkerService],
  exports: [WorkerService],
})
export class WorkerModule {}
