import { Injectable, NotFoundException } from '@nestjs/common';
import { HistoricalMetricContribution, Prisma } from '@prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import {
  DATASET_DEFINITION_MAP,
  DATASET_VERSION,
} from '../dataset/contracts/definition';
import {
  datasetWhere,
  unmaterializedMatchWhere,
} from '../dataset/adapters/dataset-query.repository';
import { DATASET_PROCESSING_VERSION } from '../dataset/contracts/processing';
import {
  finalVisionField,
  visionInvestmentContext,
} from './contracts/statistics';
import { calculateReference } from './reference-calculator';
import type { ReferenceRow } from './reference-calculator';
import type { ReferenceQuery } from './reference-contract';
export const REFERENCE_MAX_CANDIDATES = 10000;
@Injectable()
export class ReferenceService {
  constructor(private readonly prisma: PrismaService) {}
  async getReference(query: ReferenceQuery) {
    return this.prisma.$transaction(
      async (tx) => {
        const where = {
          ...datasetWhere(query.filters),
          definitionVersion: DATASET_DEFINITION_MAP.get(
            query.definition.anchorDefinitionId,
          )!.version,
        };
        const total = await tx.historicalMetricContribution.count({ where });
        const tooLarge = total > REFERENCE_MAX_CANDIDATES;
        const rows = tooLarge
          ? []
          : await tx.historicalMetricContribution.findMany({
              where,
              orderBy: [
                { gameCreation: 'asc' },
                { matchId: 'asc' },
                { id: 'asc' },
              ],
              take: REFERENCE_MAX_CANDIDATES,
            });
        const target = query.individualId
          ? await tx.historicalMetricContribution.findFirst({
              where: { AND: [where, { id: query.individualId }] },
            })
          : null;
        if (query.individualId && !target)
          throw new NotFoundException(
            'Individual anchor contribution not found in the requested homogeneous cohort',
          );
        const matchIds = [
          ...new Set([
            ...rows.map((r) => r.matchId),
            ...(target ? [target.matchId] : []),
          ]),
        ];
        const participants = matchIds.length
          ? await tx.matchParticipant.findMany({
              where: { matchId: { in: matchIds } },
              select: { matchId: true, puuid: true },
            })
          : [];
        const rosters = new Map<string, string[]>();
        for (const p of participants)
          rosters.set(p.matchId, [...(rosters.get(p.matchId) ?? []), p.puuid]);
        const subjects =
          matchIds.length &&
          (query.definition.finalField || query.definition.costUnavailable)
            ? await tx.matchParticipant.findMany({
                where: {
                  matchId: { in: matchIds },
                  puuid: {
                    in: [
                      ...new Set([
                        ...rows.map((r) => r.subjectId),
                        ...(target ? [target.subjectId] : []),
                      ]),
                    ],
                  },
                },
                select: { matchId: true, puuid: true, finalStats: true },
              })
            : [];
        const stats = new Map(
          subjects.map((p) => [`${p.matchId}:${p.puuid}`, p.finalStats]),
        );
        const project = (r: HistoricalMetricContribution): ReferenceRow => {
          const finalStats = stats.get(`${r.matchId}:${r.subjectId}`);
          const investment = visionInvestmentContext(
            finalStats,
            query.filters.patch!,
            query.filters.mapId!,
          );
          const datum = query.definition.costUnavailable
            ? investment.goldSpent
            : query.definition.finalField
              ? finalVisionField(finalStats, query.definition.finalField)
              : {
                  value: r.validCount === 1 ? r.value : null,
                  reason: r.reason,
                };
          return {
            id: r.id,
            matchId: r.matchId,
            subjectId: r.subjectId,
            gameCreation: r.gameCreation,
            value: datum.value,
            eligible: r.eligible,
            reason: r.eligible ? datum.reason : r.exclusionReason,
            roster: rosters.get(r.matchId) ?? [],
            processedAt: r.processedAt,
            lineage: r.lineage,
            origin:
              datum.value === null
                ? 'unavailable'
                : query.definition.finalField
                  ? 'observed'
                  : r.origin,
            source:
              query.definition.finalField || query.definition.costUnavailable
                ? {
                    datasetAnchorId: r.id,
                    finalStatsProjectionVersion:
                      (finalStats as { projectionVersion?: number } | null)
                        ?.projectionVersion ?? null,
                    field: query.definition.finalField ?? null,
                    investment,
                  }
                : {
                    datasetContributionId: r.id,
                    evidence: r.evidence,
                    unit: r.unit,
                    denominator: r.denominator,
                  },
            context: {
              patch: r.patch,
              queueId: r.queueId,
              mapId: r.mapId,
              championId: r.championId,
              role: r.role,
              horizonKey: r.horizonKey,
              definitionVersion: r.definitionVersion,
            },
          };
        };
        const result = calculateReference(
          query,
          rows.map(project),
          target ? project(target) : null,
          await tx.match.count({
            where: unmaterializedMatchWhere(query.filters),
          }),
          tooLarge,
          total,
        );
        return {
          datasetVersion: DATASET_VERSION,
          processingVersion: DATASET_PROCESSING_VERSION,
          maximumCandidateRows: REFERENCE_MAX_CANDIDATES,
          ...result,
          visionInvestmentPolicy: query.definition.metricId.startsWith('V')
            ? {
                catalog: visionInvestmentContext(
                  null,
                  query.filters.patch!,
                  query.filters.mapId!,
                ).goldSpent.catalog,
                costReason:
                  'No validated purchase-time quest/discount context; gold expenditure cannot be inferred from catalog list price',
                sources: [
                  'https://ddragon.leagueoflegends.com/cdn/16.2.1/data/en_US/item.json',
                  'https://www.leagueoflegends.com/en-sg/news/game-updates/patch-26-1-notes/',
                ],
              }
            : null,
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        timeout: 30000,
      },
    );
  }
}
