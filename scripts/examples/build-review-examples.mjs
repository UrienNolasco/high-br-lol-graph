#!/usr/bin/env node
/** Rebuild MET-34 design payloads from checked-in evidence; no services. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
const get = (object, key) => (Object.hasOwn(object, key) ? object[key] : null);
export function buildExamples(summary, timeline) {
  const matchId = summary.metadata.matchId,
    participants = summary.info.participants;
  function metric(
    player,
    code,
    label,
    field,
    unit = 'count',
    denominatorField = null,
  ) {
    let value = get(player, field);
    const evidence = [
      {
        source: 'match',
        field: `info.participants[${participants.indexOf(player)}].${field}`,
        value,
      },
    ];
    let denominator = null;
    if (denominatorField) {
      const team = participants.filter((p) => p.teamId === player.teamId),
        values = team.map((p) => get(p, denominatorField));
      const total = values.every((v) => v !== null)
        ? values.reduce((a, b) => a + b, 0)
        : null;
      denominator = {
        value: total,
        unit,
        population: 'five participants on subject team',
      };
      evidence.push(
        ...team.map((p) => ({
          source: 'match',
          field: `info.participants[${participants.indexOf(p)}].${denominatorField}`,
          value: get(p, denominatorField),
        })),
      );
      value = value !== null && total ? (value / total) * 100 : null;
      unit = 'percent';
    }
    const reason =
      value !== null
        ? null
        : denominator?.value === 0
          ? 'zero_denominator'
          : 'missing_field';
    return {
      label,
      metricId: code,
      metricVersion: 1,
      processingVersion: 1,
      processedAt: '2026-09-23T00:00:00.000Z',
      matchId,
      subject: { kind: 'participant', id: player.puuid },
      unit,
      window: null,
      denominator,
      quality: {
        validSamples: Number(value !== null),
        totalSamples: 1,
        coverage: Number(value !== null),
        unknownEvents: 0,
        reconciliationIssues: [],
      },
      evidence,
      value,
      origin:
        value === null ? 'unavailable' : denominator ? 'derived' : 'observed',
      reason,
      method: denominator
        ? `${field} / team sum(${denominatorField}) * 100`
        : field,
    };
  }
  function eventRef([fi, ei, event]) {
    return {
      id: `${matchId}:${fi}:${ei}`,
      timestampMs: event.timestamp,
      type: event.type,
      frameIndex: fi,
      eventIndex: ei,
      fields: Object.fromEntries(
        [
          'victimId',
          'killerId',
          'teamId',
          'killerTeamId',
          'monsterType',
          'buildingType',
        ]
          .filter((k) => Object.hasOwn(event, k))
          .map((k) => [k, event[k]]),
      ),
    };
  }
  function report(champion) {
    const p = participants.find((p) => p.championName === champion);
    if (!p) throw new Error(`Missing fixture champion: ${champion}`);
    const events = timeline.info.frames.flatMap((f, fi) =>
      f.events.map((e, ei) => [fi, ei, e]),
    );
    const death = events.find(
      ([, , e]) =>
        e.type === 'CHAMPION_KILL' &&
        e.victimId === p.participantId &&
        e.timestamp > 1190000 &&
        e.timestamp < 1200000,
    );
    if (!death) throw new Error(`Missing fixture death: ${champion}`);
    const objectives = events.filter(
      ([, , e]) =>
        ['BUILDING_KILL', 'ELITE_MONSTER_KILL'].includes(e.type) &&
        e.timestamp > death[2].timestamp &&
        e.timestamp <= death[2].timestamp + 60000 &&
        (e.teamId === 100
          ? 200
          : e.teamId === 200
            ? 100
            : get(e, 'killerTeamId')) !== p.teamId,
    );
    if (objectives.length !== 2)
      throw new Error(
        `Expected two objective events, got ${objectives.length}`,
      );
    const evidence = [death, ...objectives].map(eventRef);
    return {
      exampleKind: 'design-contract-with-real-fixture-values',
      schemaVersion: 'proposal-1',
      matchId,
      participant: {
        puuid: p.puuid,
        riotId: `${Object.hasOwn(p, 'riotIdGameName') ? p.riotIdGameName : champion}#${Object.hasOwn(p, 'riotIdTagline') ? p.riotIdTagline : ''}`,
        champion,
        role: p.teamPosition,
      },
      context: {
        queueId: summary.info.queueId,
        mapId: summary.info.mapId,
        gameVersion: summary.info.gameVersion,
        gameDurationSeconds: summary.info.gameDuration,
        win: p.win,
        historicalReference: null,
        historicalReferenceReason: 'insufficient_sample',
      },
      dimensions: [
        {
          id: 'resources',
          label: 'Recursos',
          metrics: [
            metric(
              p,
              'E04',
              'Ouro do time',
              'goldEarned',
              'gold',
              'goldEarned',
            ),
          ],
        },
        {
          id: 'combat',
          label: 'Combate',
          metrics: [
            metric(
              p,
              'C02',
              'Dano a campeões do time',
              'totalDamageDealtToChampions',
              'damage',
              'totalDamageDealtToChampions',
            ),
            metric(p, 'C04.heal', 'Cura em aliados', 'totalHealsOnTeammates'),
            metric(
              p,
              'C04.shield',
              'Escudos em aliados',
              'totalDamageShieldedOnTeammates',
            ),
          ],
        },
        {
          id: 'vision',
          label: 'Visão',
          metrics: [
            metric(p, 'V03.placed', 'Wards colocadas', 'wardsPlaced'),
            metric(p, 'V03.removed', 'Wards removidas', 'wardsKilled'),
          ],
        },
        {
          id: 'structures',
          label: 'Estruturas',
          metrics: [
            metric(
              p,
              'O03',
              'Dano a torres do time',
              'damageDealtToTurrets',
              'damage',
              'damageDealtToTurrets',
            ),
          ],
        },
      ],
      episodes: [
        {
          id: `${matchId}:death:${death[0]}:${death[1]}`,
          label: 'Morte e objetivos adversários nos 60 s seguintes',
          origin: 'derived',
          unit: 'death',
          value: 1,
          eligibleDeathsInThisExample: 1,
          window: {
            startMs: death[2].timestamp,
            endMs: death[2].timestamp + 60000,
            bounds: '(]',
          },
          censored: false,
          evidenceIds: evidence.map((e) => e.id),
          limitation:
            'Proximidade temporal; não demonstra que a morte causou os objetivos. Este exemplo contém um episódio, não a contagem de todas as mortes.',
        },
      ],
      evidence,
    };
  }
  return {
    notice:
      'Proposta de consumo MET-34; não é resposta de endpoint existente. Dados reais da fixture, timestamp de processamento ilustrativo. Nenhum feedback de jogadores foi coletado.',
    reports: [report('Fiora'), report('Milio')],
  };
}
export function main(args = process.argv.slice(2)) {
  const { values } = parseArgs({
    args,
    options: {
      'output-dir': { type: 'string', default: resolve(ROOT, 'docs/review') },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help) {
    console.log(
      'Usage: node scripts/examples/build-review-examples.mjs [--output-dir PATH]',
    );
    return;
  }
  const examples = buildExamples(
    read(resolve(ROOT, 'exemplo_partida_BR1_3200579475.json')),
    read(resolve(ROOT, 'exemplo_partida_timeline_BR1_3200579475.json')),
  );
  mkdirSync(values['output-dir'], { recursive: true });
  const serialized = JSON.stringify(examples, null, 2) + '\n';
  writeFileSync(resolve(values['output-dir'], 'payloads.json'), serialized);
  writeFileSync(
    resolve(values['output-dir'], 'examples.js'),
    'window.REVIEW_EXAMPLES = ' + serialized.trimEnd() + ';\n',
  );
  console.log(
    'Generated 2 reports, 4 dimensions each, 14 metrics and 6 linked evidence records from the fixture.',
  );
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  main();
