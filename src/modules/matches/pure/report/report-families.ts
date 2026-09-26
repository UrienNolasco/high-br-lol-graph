import { computeContribution } from '../contribution-calculator';
import { calculateEconomy } from '../economy-calculator';
import { calculateVision } from '../vision-calculator';
import { calculateObjectives } from '../objectives-calculator';
import { calculateCombat } from '../combat-calculator';
import { combatInput } from '../combat-source';
import { calculateSequences } from '../sequences-calculator';
import { calculateProgression } from '../progression/progression-calculator';
import { readSnapshotProjection } from '../../contracts/snapshot-readers';
import { ItemCatalog, SkillCatalog } from '../../contracts/catalogs';
import {
  ReportFamily,
  ReportInput,
  ReportOptions,
  sourceKnown,
  sourceTime,
} from './report.types';
export interface ReportCatalogs {
  items: ItemCatalog;
  skills: SkillCatalog;
}
export interface ReportFamilyData {
  family: ReportFamily;
  metricVersion: number;
  processingVersion: number | null;
  processedAt: string | null;
  reason: string | null;
  metadata: Record<string, unknown>;
  sections: Record<string, unknown>;
}
export function reportFamilies(
  input: ReportInput,
  puuid: string,
  options: ReportOptions,
  catalogs: ReportCatalogs,
) {
  const player = input.participants.find((p) => p.puuid === puuid)!;
  const known = sourceKnown(input),
    version = input.processing?.processingVersion ?? null,
    processedAt = sourceTime(input);
  const processing = processedAt ? input.processing : null;
  const projection = input.readLimits.framesTruncated
    ? null
    : readSnapshotProjection(input.timelineProjection);
  const shared = { ...input, processing, projection };
  const cache = new Map<ReportFamily, ReportFamilyData>();
  const calculate = (family: ReportFamily): ReportFamilyData => {
    const previous = cache.get(family);
    if (previous) return previous;
    const base: ReportFamilyData = {
      family,
      metricVersion: 1,
      processingVersion: known ? version : null,
      processedAt: known ? processedAt : null,
      reason: null,
      metadata: {},
      sections: {},
    };
    if (
      !['contribution', 'economy'].includes(family) &&
      input.readLimits.eventsTruncated
    ) {
      const missing = { ...base, reason: 'event_read_limit_exceeded' };
      cache.set(family, missing);
      return missing;
    }
    if (!known && family !== 'progression') {
      const unavailable = {
        ...base,
        reason:
          version !== null && version < 2
            ? 'unsupported_processing_version'
            : 'missing_processing_metadata',
      };
      cache.set(family, unavailable);
      return unavailable;
    }
    let result: ReportFamilyData = base;
    if (family === 'contribution') {
      const report = known
        ? computeContribution(
            {
              ...input,
              processingVersion: version!,
              processedAt: processedAt!,
            },
            player,
          )
        : null;
      result = {
        ...base,
        reason: report
          ? null
          : version !== null && version < 2
            ? 'unsupported_processing_version'
            : 'missing_processing_metadata',
        metadata: { roleExplanation: report?.roleExplanation ?? null },
        sections: report?.dimensions ?? {},
      };
    } else if (family === 'economy') {
      const report = calculateEconomy(shared, puuid, options.mode);
      result = {
        ...base,
        reason: report.reason,
        metadata: {
          quality: report.quality,
          checkpointContract: report.checkpointContract,
          opponent: report.opponent,
          observedEndMs: report.observedEndMs,
        },
        sections: {
          checkpoints: report.checkpoints,
          samples: report.samples,
          intervals: report.intervals,
          phases: report.phases,
          unspentGold: report.unspentGold,
          finalResources: report.finalResources,
        },
      };
    } else if (family === 'vision') {
      const report = calculateVision(shared, puuid);
      result = {
        ...base,
        reason: report.reason,
        metadata: { coverage: report.coverage, window: report.window },
        sections: {
          metrics: report.metrics,
          byType: report.byType,
          phases: report.phases,
          gaps: report.gaps,
          objectiveWindows: report.objectiveWindows,
          reconciliation: report.reconciliation,
        },
      };
    } else if (family === 'objectives') {
      const output = calculateObjectives(shared),
        report = output.report;
      result = {
        ...base,
        reason: output.reason ?? report?.coverage.reason ?? null,
        metadata: {
          coverage: report?.coverage ?? null,
          interpretation: report?.interpretation ?? null,
        },
        sections: report
          ? {
              chronology: report.chronology,
              finalTotals: report.finalTotals,
              reconciliation: report.reconciliation,
              participantContributions: report.participantContributions.filter(
                (p) => p.puuid === puuid,
              ),
              structures: report.structures,
              plates: report.plates,
            }
          : {},
      };
    } else if (family === 'combat') {
      const prepared = combatInput(
        input,
        input.events,
        processing ? { matchId: input.matchId, ...processing } : undefined,
      );
      const report = prepared ? calculateCombat(prepared) : null;
      result = {
        ...base,
        reason:
          report?.quality.reason ??
          (report ? null : 'missing_processing_metadata'),
        metadata: {
          quality: report?.quality ?? null,
          interpretation: report?.relationSemantics ?? null,
        },
        sections: report
          ? {
              participant:
                report.participants.find((p) => p.puuid === puuid) ?? null,
              killerVictimMatrix: report.killerVictimMatrix.filter(
                (e) => e.killerPuuid === puuid || e.victimPuuid === puuid,
              ),
              coParticipation: report.coParticipation.filter(
                (e) => e.participantA === puuid || e.participantB === puuid,
              ),
            }
          : {},
      };
    } else if (family === 'sequences') {
      const output = calculateSequences(shared),
        report = output.report;
      result = {
        ...base,
        reason: output.reason ?? report?.coverage.rateUnavailableReason ?? null,
        metadata: {
          coverage: report?.coverage ?? null,
          parameters: output.parameters,
          limitations: report?.limitations ?? null,
        },
        sections: report
          ? {
              deathEpisodes: report.deathEpisodes.filter(
                (e) => e.subjectId === puuid,
              ),
              deathRates: report.deathRates.filter(
                (e) => e.subjectId === puuid,
              ),
              killEpisodes: report.killEpisodes.filter(
                (e) => e.subjectId === String(player.teamId),
              ),
              killRates: report.killRates.filter(
                (e) => e.subjectId === String(player.teamId),
              ),
              goldChanges: report.goldChanges,
              temporalTrades: report.temporalTrades,
              comeback: report.comeback,
            }
          : {},
      };
    } else {
      const report = calculateProgression(
        {
          ...input,
          processing,
          participant: player,
          snapshotProjection: input.readLimits.framesTruncated
            ? null
            : input.timelineProjection,
        },
        catalogs.items,
        catalogs.skills,
      );
      result = {
        ...base,
        reason: !known
          ? version !== null && version < 2
            ? 'unsupported_processing_version'
            : 'missing_processing_metadata'
          : report.quality.reason,
        metadata: {
          quality: report.quality,
          catalogs: report.catalogs,
          interpretation: report.interpretation,
        },
        sections: {
          inventory: report.finalInventory,
          acquisitions: report.trajectory?.acquisitions ?? null,
          transitions: report.trajectory?.transitions ?? null,
          itemTimings: report.trajectory?.itemTimings ?? null,
          skills: report.skillSequence,
          reconciliation:
            report.trajectory?.finalInventoryReconciliation ?? null,
        },
      };
    }
    if (
      input.readLimits.framesTruncated &&
      ['economy', 'sequences', 'progression'].includes(family)
    )
      result = {
        ...result,
        reason: result.reason ?? 'frame_read_limit_exceeded',
        metadata: {
          ...result.metadata,
          snapshotsUnavailable: 'frame_read_limit_exceeded',
        },
      };
    cache.set(family, result);
    return result;
  };
  return { calculate, player, processing, projection };
}
