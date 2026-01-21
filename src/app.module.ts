import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppConfigModule } from './core/config/config.module';
import { PrismaModule } from './core/prisma/prisma.module';

import { ApiModule } from './modules/api/api.module';
import { WorkerModule } from './modules/worker/worker.module';
import { CollectorModule } from './modules/collector/collector.module';
import { DataDragonModule } from './core/data-dragon/data-dragon.module';

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    ApiModule,
    CollectorModule,
    WorkerModule,
    DataDragonModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
