import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';

@Injectable()
export class CollectorRepository {
  constructor(private readonly prisma: PrismaService) {}

  async matchExists(matchId: string): Promise<boolean> {
    const match = await this.prisma.match.findUnique({
      where: { matchId },
      select: { matchId: true },
    });
    return !!match;
  }
}
