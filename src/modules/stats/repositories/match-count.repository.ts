import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';

@Injectable()
export class MatchCountRepository {
  constructor(private readonly prisma: PrismaService) {}

  async countByPatch(patch: string) {
    return this.prisma.match.count({
      where: { gameVersion: { startsWith: patch } },
    });
  }

  async countTotal() {
    return this.prisma.match.count();
  }
}
