import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AppConfigModule } from './core/config/config.module';
import { QueueModule } from './core/queue/queue.module';
import { PrismaModule } from './core/prisma/prisma.module';

import { ApiModule } from './modules/api/api.module';
import { WorkerModule } from './modules/worker/worker.module';
import { CollectorModule } from './modules/collector/collector.module';
import { RiotModule } from './core/riot/riot.module';

@Module({
  imports: [
    // --- Módulos Core ---
    AppConfigModule,
    PrismaModule,
    QueueModule,
    RiotModule,

    // --- Módulos de Feature/Negócio ---
    ApiModule,
    CollectorModule,
    WorkerModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
