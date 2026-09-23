import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { calculateKillEpisodes } from './kill-episodes-calculator';
import { episodeEvent, killEpisodesFixture } from './kill-episodes.fixture';
import { normalizeTimelineEvents } from '../../../core/riot/normalized-events';
import { projectTimelineSnapshots } from '../../../core/riot/timeline-snapshots';
import { PROCESSING_VERSION } from '../../../core/processing/processing.constants';
describe('C10/C11/E06 episode report', () => {
  it('reports estimated episode membership, known team balance, past snapshot and distinct sensitivity results', () => {
    const input = killEpisodesFixture([
      episodeEvent(),
      episodeEvent({
        eventIndex: 1,
        timestampMs: 110000,
        positionX: 2600,
        actorParticipantId: 2,
        actorPuuid: 'b',
        victimPuuid: 'a',
        sourceTeamId: 200,
      }),
    ]);
    const r = calculateKillEpisodes(input).report!;
    expect(r.episodeCount).toMatchObject({
      metricId: 'C11',
      origin: 'estimated',
      value: 1,
      processingVersion: 2,
    });
    expect(r.quickTradeCount.value).toBe(1);
    expect(r.episodes[0].teamBalance.map((t) => t.net.value)).toEqual([0, 0]);
    expect(r.episodes[0].resources.ageMs).toBe(40000);
    expect(r.sensitivity.map((s) => s.observedEpisodeCount)).toEqual([2, 1, 1]);
    expect(r.sensitivity[0].coClusterPairChangesFromDefault).toBe(1);
  });
  it('exposes missing positions/times as unassigned, not guessed coordinates or zero complete-match episodes', () => {
    const input = killEpisodesFixture([
      episodeEvent({ positionX: null }),
      episodeEvent({ eventIndex: 1, timestampMs: null }),
    ]);
    const r = calculateKillEpisodes(input).report!;
    expect(r.unassigned).toHaveLength(2);
    expect(r.episodes).toEqual([]);
    expect(r.episodeCount).toMatchObject({
      value: null,
      reason: 'missing_field',
      quality: { coverage: 0 },
    });
  });
  it('rejects unsupported map/mixed generation/duplicate identities and records summary or terminal incompleteness', () => {
    const input = killEpisodesFixture();
    input.mapId = 99;
    expect(calculateKillEpisodes(input)).toMatchObject({
      report: null,
      reason: 'unsupported_version',
    });
    input.mapId = 11;
    input.events[0].processingVersion = 99;
    expect(calculateKillEpisodes(input)).toMatchObject({
      report: null,
      reason: 'unsupported_version',
    });
    const duplicate = killEpisodesFixture();
    duplicate.events.push(duplicate.events[0]);
    expect(calculateKillEpisodes(duplicate)).toMatchObject({
      report: null,
      reason: 'invalid_value',
    });
    const missing = killEpisodesFixture();
    missing.participants[0].kills = 5;
    expect(calculateKillEpisodes(missing).report!.episodeCount.reason).toBe(
      'incomplete_events',
    );
    const noEnd = killEpisodesFixture();
    noEnd.events = noEnd.events.filter((e) => e.type !== 'GAME_END');
    expect(calculateKillEpisodes(noEnd).report!.episodeCount.reason).toBe(
      'missing_frame',
    );
  });
  it('keeps environmental deaths but excludes them from player response eligibility, and marks unknown trade teams', () => {
    const environmental = killEpisodesFixture([
      episodeEvent({
        actorParticipantId: null,
        actorPuuid: null,
        payload: { killerId: 0 },
      }),
    ]);
    let r = calculateKillEpisodes(environmental).report!;
    expect(r.episodes).toHaveLength(1);
    expect(r.quickTradeCount.value).toBe(0);
    expect(r.coverage.excludedEnvironmentalEvents).toBe(1);
    expect(r.episodes[0].teamBalance[0].net.reason).toBe('missing_field');
    const unknown = killEpisodesFixture([
      episodeEvent({
        actorParticipantId: 99,
        actorPuuid: null,
        payload: { killerId: 99 },
      }),
    ]);
    r = calculateKillEpisodes(unknown).report!;
    expect(r.quickTradeCount).toMatchObject({
      value: null,
      reason: 'missing_field',
    });
  });
  it('reconciles92 real kill events once, retains real frame ages, and is insensitive to source array order', () => {
    const root = join(__dirname, '../../../..');
    const summary = JSON.parse(
      readFileSync(join(root, 'exemplo_partida_BR1_3200579475.json'), 'utf8'),
    );
    const timeline = JSON.parse(
      readFileSync(
        join(root, 'exemplo_partida_timeline_BR1_3200579475.json'),
        'utf8',
      ),
    );
    const map = new Map<number, string>(
      summary.info.participants.map((p) => [p.participantId, p.puuid]),
    );
    const events = normalizeTimelineEvents(
      timeline,
      map,
      new Map(
        summary.info.participants.map((p) => [p.participantId, p.teamId]),
      ),
    );
    const input = {
      ...killEpisodesFixture(),
      matchId: summary.metadata.matchId,
      gameVersion: summary.info.gameVersion,
      gameDuration: summary.info.gameDuration,
      participants: summary.info.participants,
      events,
      processingVersion: PROCESSING_VERSION,
      snapshotProjection: projectTimelineSnapshots(timeline, map),
    };
    const result = calculateKillEpisodes(input),
      r = result.report!;
    expect(r.coverage).toMatchObject({
      sourceKillEvents: 92,
      assignedKillEvents: 92,
      unassignedKillEvents: 0,
      summaryReconciled: true,
      reason: null,
    });
    expect(new Set(r.episodes.flatMap((e) => e.eventIds)).size).toBe(92);
    expect(
      r.episodes.every(
        (e) =>
          e.resources.snapshotTimestampMs! < e.startMs &&
          e.resources.ageMs === e.startMs - e.resources.snapshotTimestampMs!,
      ),
    ).toBe(true);
    expect(
      new Set(r.quickTrades.flatMap((t) => [t.deathEventId, t.responseEventId]))
        .size,
    ).toBe(2 * r.quickTrades.length);
    input.events.reverse();
    expect(calculateKillEpisodes(input)).toEqual(result);
  });
});
