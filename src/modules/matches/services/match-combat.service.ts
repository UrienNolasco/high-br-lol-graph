import { Injectable, NotFoundException } from '@nestjs/common';
import { CombatRepository } from '../repositories/combat.repository';
import { calculateCombat } from '../pure/combat-calculator';
@Injectable()
export class MatchCombatService {
  constructor(private readonly repository: CombatRepository) {}
  async getCombat(matchId: string) {
    const data = await this.repository.findMatchCombat(matchId);
    if (!data) throw new NotFoundException(`Match ${matchId} not found`);
    return {
      ...(data.input
        ? calculateCombat(data.input)
        : {
            matchId,
            metricVersion: 1,
            processingVersion: data.source?.processingVersion ?? null,
            processedAt: data.source?.completedAt?.toISOString() ?? null,
            source: 'MatchEventProjection + MatchParticipant',
            window: null,
            quality: { available: false, reason: 'missing_projection' },
            participants: [] as ReturnType<
              typeof calculateCombat
            >['participants'],
            killerVictimMatrix: [] as ReturnType<
              typeof calculateCombat
            >['killerVictimMatrix'],
            coParticipation: [] as ReturnType<
              typeof calculateCombat
            >['coParticipation'],
            relationSemantics:
              'Unavailable processing provenance; empty lists do not represent zero events',
          }),
      cohort: {
        gameVersion: data.match.gameVersion,
        queueId: data.match.queueId,
        mapId: data.match.mapId,
      },
    };
  }
}
