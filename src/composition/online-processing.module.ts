import { Module } from '@nestjs/common';
import { CollectorDiscoveryModule } from '../modules/collector/collector-discovery.module';
import { ProcessingModule } from '../modules/processing/processing.module';
import { WorkerModule } from '../modules/worker/worker.module';

/** Online processing graph. The discovery reader is explicit and side-effect free. */
@Module({
  imports: [CollectorDiscoveryModule, ProcessingModule, WorkerModule],
  exports: [ProcessingModule, WorkerModule],
})
export class OnlineProcessingModule {}
