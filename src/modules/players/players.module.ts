import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PlayersController } from './players.controller';
import { PlayersService } from './players.service';
import { SyncService } from './sync.service';
import { RiotModule } from '../../core/riot/riot.module';
import { PrismaModule } from '../../core/prisma/prisma.module';
import { QueueModule } from '../../core/queue/queue.module';

@Module({
  imports: [RiotModule, PrismaModule, QueueModule, ConfigModule],
  controllers: [PlayersController],
  providers: [PlayersService, SyncService],
})
export class PlayersModule {}
