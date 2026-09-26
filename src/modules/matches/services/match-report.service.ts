import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ReportRepository } from '../repositories/report.repository';
import { MatchReportQueryDto } from '../dto/match-report-query.dto';
import {
  ReportOptions,
  DEFAULT_REPORT_OPTIONS,
  record,
  isFiniteNumber,
  sourceKnown,
  sourceTime,
} from '../pure/report/report.types';
import {
  ReportFamily,
  REPORT_FAMILIES,
  REPORT_SECTIONS,
} from '../contracts/calculations/report';
import { reportFamilies } from '../pure/report/report-families';
import {
  buildReportSummary,
  observedReportTotals,
  reportSourceAvailability,
} from '../pure/report/report-summary';
import {
  buildReportEpisodes,
  presentEpisode,
  filteredEpisodes,
} from '../pure/report/report-episodes';
import {
  reportBase,
  navigationPath,
  selectPath,
  compactSection,
  parseMetricKey,
  isMetric,
  reportMetric,
  page,
  evidenceId,
  collectEvidence,
} from '../pure/report/report-navigation';
import type { CatalogReader } from '../ports/catalog-reader';
import { MATCH_CATALOGS } from '../ports/catalog-reader';
@Injectable()
export class MatchReportService {
  constructor(
    private readonly repository: ReportRepository,
    @Inject(MATCH_CATALOGS) private readonly catalogs: CatalogReader,
  ) {}
  private options(query: MatchReportQueryDto): ReportOptions {
    const options = { ...DEFAULT_REPORT_OPTIONS, ...query };
    if (
      options.fromMs !== undefined &&
      options.toMs !== undefined &&
      options.fromMs >= options.toMs
    )
      throw new BadRequestException('fromMs must be less than toMs');
    navigationPath(options.path);
    return options;
  }
  private async context(
    matchId: string,
    puuid: string,
    query: MatchReportQueryDto,
  ) {
    const options = this.options(query),
      input = await this.repository.findReport(matchId, puuid);
    if (!input) throw new NotFoundException('Match or participant not found');
    const player = input.participants.find((p) => p.puuid === puuid)!;
    const catalogs = {
      items: this.catalogs.getCachedItemCatalog(input.gameVersion),
      skills: this.catalogs.getCachedSkillCatalog(
        input.gameVersion,
        player.championId,
      ),
    };
    const families = reportFamilies(input, puuid, options, catalogs),
      base = reportBase(matchId, puuid);
    return { input, options, catalogs, families, base };
  }
  async summary(matchId: string, puuid: string, query: MatchReportQueryDto) {
    const c = await this.context(matchId, puuid, query);
    return buildReportSummary(c.input, puuid, c.options, c.catalogs);
  }
  async family(
    matchId: string,
    puuid: string,
    familyName: string,
    query: MatchReportQueryDto,
  ) {
    if (!REPORT_FAMILIES.includes(familyName as ReportFamily))
      throw new BadRequestException('Unknown report family');
    const family = familyName as ReportFamily,
      section = query.section ?? REPORT_SECTIONS[family][0];
    if (!REPORT_SECTIONS[family].includes(section))
      throw new BadRequestException('Unknown family section');
    const c = await this.context(matchId, puuid, query),
      result = c.families.calculate(family),
      path = navigationPath(c.options.path);
    const sectionValue = result.sections[section] ?? null;
    const selected = path.length
      ? selectPath(sectionValue, path)
      : sectionValue;
    return {
      schemaVersion: 1,
      matchId,
      puuid,
      family,
      section,
      ...{
        metricVersion: result.metricVersion,
        processingVersion: result.processingVersion,
        processedAt: result.processedAt,
        reason: result.reason,
      },
      metadata: result.metadata,
      filters: {
        fromMs: c.options.fromMs ?? null,
        toMs: c.options.toMs ?? null,
        appliedTo: 'presentation_only; original denominators retained',
      },
      readLimits: c.input.readLimits,
      data: compactSection(result, section, selected, path, c.base, c.options),
    };
  }
  async episodes(
    matchId: string,
    puuid: string,
    query: MatchReportQueryDto,
    episodeId?: string,
  ) {
    const c = await this.context(matchId, puuid, query),
      sequences = c.families.calculate('sequences'),
      objectives = c.families.calculate('objectives');
    const rows = buildReportEpisodes(c.input, puuid, sequences, objectives);
    if (episodeId) {
      const episode = rows.find((e) => e.id === episodeId);
      if (!episode)
        throw new NotFoundException('Episode not found for this participant');
      return presentEpisode(episode, c.input, puuid, c.options);
    }
    const filtered = filteredEpisodes(rows, c.options);
    const href = (offset: number) => {
      const p = new URLSearchParams({
        offset: String(offset),
        limit: String(c.options.limit),
        evidenceLimit: String(c.options.evidenceLimit),
      });
      if (c.options.kind) p.set('kind', c.options.kind);
      if (c.options.fromMs !== undefined)
        p.set('fromMs', String(c.options.fromMs));
      if (c.options.toMs !== undefined) p.set('toMs', String(c.options.toMs));
      return `${c.base}/episodes?${p}`;
    };
    return {
      schemaVersion: 1,
      matchId,
      puuid,
      reason: reportSourceAvailability(c.input).eventsReason,
      availability: {
        sequences: sequences.reason,
        objectives: objectives.reason,
      },
      filters: {
        kind: c.options.kind ?? null,
        fromMs: c.options.fromMs ?? null,
        toMs: c.options.toMs ?? null,
      },
      page: page(
        filtered,
        c.options.offset,
        c.options.limit,
        (e) =>
          presentEpisode(e, c.input, puuid, {
            ...c.options,
            offset: 0,
            limit: Math.min(3, c.options.limit),
          }),
        href,
      ),
    };
  }
  async metric(
    matchId: string,
    puuid: string,
    key: string,
    query: MatchReportQueryDto,
  ) {
    const parsed = parseMetricKey(key),
      c = await this.context(matchId, puuid, query);
    let raw: unknown,
      meta = {
        metricVersion: 1,
        processingVersion: sourceKnown(c.input)
          ? c.input.processing!.processingVersion
          : null,
        processedAt: sourceKnown(c.input) ? sourceTime(c.input) : null,
      };
    if (parsed.family === 'totals')
      raw = selectPath(observedReportTotals(c.input, puuid), parsed.path);
    else if (parsed.family === 'episodes') {
      const rows = buildReportEpisodes(
        c.input,
        puuid,
        c.families.calculate('sequences'),
        c.families.calculate('objectives'),
      );
      const selected = rows.find((e) => e.id === parsed.path[0]);
      if (!selected) throw new NotFoundException('Episode not found');
      raw = record(selected)[parsed.path[1]];
    } else {
      const family = c.families.calculate(parsed.family);
      meta = family;
      raw = selectPath(family.sections, parsed.path);
    }
    if (!isMetric(raw)) throw new NotFoundException('Metric not found');
    const metric = reportMetric(
        raw,
        parsed.family,
        parsed.path,
        meta,
        c.base,
        0,
        c.options.mode,
      ),
      proof = record(raw).evidence as unknown[];
    return {
      ...metric,
      evidence: page(
        proof,
        c.options.offset,
        c.options.limit,
        (value) => ({
          id: evidenceId(parsed.family, value),
          ...record(value),
          href: `${c.base}/evidence/${encodeURIComponent(evidenceId(parsed.family, value))}?mode=${c.options.mode}`,
        }),
        (offset) =>
          `${c.base}/metrics/${encodeURIComponent(key)}?offset=${offset}&limit=${c.options.limit}&mode=${c.options.mode}`,
      ),
    };
  }
  async evidence(
    matchId: string,
    puuid: string,
    id: string,
    query: MatchReportQueryDto,
  ) {
    if (id.length > 512)
      throw new BadRequestException('Invalid evidence identifier');
    const c = await this.context(matchId, puuid, query);
    if (id.startsWith('event:')) {
      const selected = c.input.events.find(
        (e) => `event:${e.matchId}:${e.frameIndex}:${e.eventIndex}` === id,
      );
      if (!selected)
        throw new NotFoundException('Event evidence not found in this match');
      const payload = record(selected.payload),
        fields = [
          'itemId',
          'beforeId',
          'afterId',
          'goldGain',
          'skillSlot',
          'levelUpType',
          'monsterType',
          'monsterSubType',
          'buildingType',
          'wardType',
          'bounty',
          'shutdownBounty',
          'winningTeam',
        ];
      return {
        id,
        eventId: id.slice(6),
        metricVersion: selected.metricVersion,
        processingVersion: selected.processingVersion,
        processedAt: selected.processedAt.toISOString(),
        type: selected.type,
        timestampMs: selected.timestampMs,
        frameIndex: selected.frameIndex,
        eventIndex: selected.eventIndex,
        actorPuuid: selected.actorPuuid,
        victimPuuid: selected.victimPuuid,
        sourceTeamId: selected.sourceTeamId,
        ownerTeamId: selected.ownerTeamId,
        beneficiaryTeamId: selected.beneficiaryTeamId,
        position:
          selected.positionX !== null && selected.positionY !== null
            ? { x: selected.positionX, y: selected.positionY }
            : null,
        fields: Object.fromEntries(
          fields.flatMap((field) => {
            const value = payload[field];
            return value === null ||
              isFiniteNumber(value) ||
              typeof value === 'boolean' ||
              typeof value === 'string'
              ? [
                  [
                    field,
                    typeof value === 'string' ? value.slice(0, 200) : value,
                  ],
                ]
              : [];
          }),
        ),
        fieldLimits: {
          maximumTextLength: 200,
          truncatedFields: fields.filter(
            (field) =>
              typeof payload[field] === 'string' && payload[field].length > 200,
          ),
        },
        limitations:
          'Selected projected event fields only; no inferred coordinates, intent or causality',
      };
    }
    const family = id.split(':')[0];
    let data: unknown;
    if (family === 'totals') data = observedReportTotals(c.input, puuid);
    else if (family === 'episodes')
      data = buildReportEpisodes(
        c.input,
        puuid,
        c.families.calculate('sequences'),
        c.families.calculate('objectives'),
      );
    else if (REPORT_FAMILIES.includes(family as ReportFamily))
      data = c.families.calculate(family as ReportFamily).sections;
    else throw new BadRequestException('Invalid evidence family');
    const found = collectEvidence(data, family, id);
    if (found === undefined)
      throw new NotFoundException('Evidence not found for this participant');
    const proof = record(found);
    return {
      id,
      ...proof,
      processingVersion: sourceKnown(c.input)
        ? c.input.processing!.processingVersion
        : null,
      processedAt: sourceKnown(c.input) ? sourceTime(c.input) : null,
      ...(typeof proof.eventId === 'string'
        ? {
            eventHref: `${c.base}/evidence/${encodeURIComponent(`event:${proof.eventId}`)}`,
          }
        : {}),
    };
  }
}
