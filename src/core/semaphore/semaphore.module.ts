import { Module } from '@nestjs/common';
import { SemaphoreService } from './semaphore.service';

@Module({
  providers: [SemaphoreService],
  exports: [SemaphoreService],
})
export class SemaphoreModule {}
