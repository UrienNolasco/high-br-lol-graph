import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AppConfigModule } from './core/config/config.module';
import { QueueModule } from './core/queue/queue.module';
import { DatabaseModule } from './core/database/database.module';
import { ApiModule } from './modules/api/api.module';
import { WorkerController } from './modules/worker/worker.controller';
import { WorkerModule } from './modules/worker/worker.module';
import { CollectorModule } from './modules/collector/collector.module';

@Module({
  imports: [
    // --- Módulos Core ---
    AppConfigModule,
    DatabaseModule,
    QueueModule,

    // --- Módulos de Feature/Negócio ---
    ApiModule,
    CollectorModule,
    WorkerModule,
  ],
  controllers: [AppController, WorkerController],
  providers: [AppService],
})
export class AppModule {}
