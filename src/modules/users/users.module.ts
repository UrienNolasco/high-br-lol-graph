import { Module } from '@nestjs/common';
import { RiotModule } from '../../core/riot/riot.module';
import { PrismaModule } from '../../core/prisma/prisma.module';
import { QueueModule } from '../../core/queue/queue.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [RiotModule, PrismaModule, QueueModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
