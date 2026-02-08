import { Module } from '@nestjs/common';
import { PlayersController } from './players.controller';
import { PlayersService } from './players.service';
import { RiotModule } from '../../core/riot/riot.module';
import { PrismaModule } from '../../core/prisma/prisma.module';
import { QueueModule } from '../../core/queue/queue.module';

@Module({
  imports: [RiotModule, PrismaModule, QueueModule],
  controllers: [PlayersController],
  providers: [PlayersService],
})
export class PlayersModule {}
