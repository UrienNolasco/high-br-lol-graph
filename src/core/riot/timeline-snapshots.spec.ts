import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  legacyMinuteGraphs,
  projectTimelineSnapshots,
  snapshotCheckpoint,
} from './timeline-snapshots';
import {
  computeSnapshotGoldTimeline,
  findObservedSwing,
} from '../../modules/matches/pure/gold-calculator';
import { projectionComparisonTimeline } from '../../modules/analytics/pure/comparison-timeline.adapter';
import { TimelineParserService } from './timeline-parser.service';

const timeline = JSON.parse(
  readFileSync(
    join(__dirname, '../../../exemplo_partida_timeline_BR1_3200579475.json'),
    'utf8',
  ),
);
const match = JSON.parse(
  readFileSync(
    join(__dirname, '../../../exemplo_partida_BR1_3200579475.json'),
    'utf8',
  ),
);
const participants = new Map<number, string>(
  timeline.info.participants.map((p) => [p.participantId, p.puuid]),
);

describe('complete timestamped snapshots', () => {
  it('preserves every real frame and participant with scalar and nested-stat precision', () => {
    const projection = projectTimelineSnapshots(timeline, participants);
    expect(projection.frames).toHaveLength(41);
    expect(
      projection.frames.flatMap((f) => Object.values(f.participantFrames)),
    ).toHaveLength(410);
    expect(
      projection.frames.slice(-2).map((f) => [f.frameIndex, f.timestamp]),
    ).toEqual([
      [39, 2340765],
      [40, 2368922],
    ]);
    for (const frame of projection.frames)
      for (const [id, p] of Object.entries(frame.participantFrames)) {
        const source =
          timeline.info.frames[frame.frameIndex].participantFrames[id];
        for (const key of [
          'totalGold',
          'currentGold',
          'xp',
          'level',
          'minionsKilled',
          'jungleMinionsKilled',
          'position',
        ])
          expect(p[key]).toEqual(source[key]);
        expect(p.damageStats).toMatchObject(source.damageStats);
        expect(p.championStats).toMatchObject(source.championStats);
        expect(p.additionalFields.goldPerSecond).toBe(source.goldPerSecond);
      }
    expect(projection.observedEndMs).toBe(2368922);
  });
  it('returns explicit nulls for missing/invalid values, preserves observed zero and unknown numeric stats', () => {
    const raw = structuredClone(timeline);
    const p = raw.info.frames[15].participantFrames['1'];
    delete p.currentGold;
    delete p.damageStats.totalDamageTaken;
    p.xp = NaN;
    p.position = undefined;
    p.totalGold = 0;
    p.championStats.futureStat = 123.4567890123;
    const projection = projectTimelineSnapshots(raw, participants);
    expect(projection.frames[15].participantFrames['1']).toMatchObject({
      totalGold: 0,
      xp: null,
      currentGold: null,
      position: null,
      damageStats: { totalDamageTaken: null },
      championStats: { futureStat: 123.4567890123 },
      missingFields: expect.arrayContaining([
        'currentGold',
        'xp',
        'position',
        'damageStats.totalDamageTaken',
      ]),
    });
    expect(JSON.parse(JSON.stringify(projection))).toEqual(projection);
  });
  it('keeps duplicate timestamps and missing participant frames independently identifiable', () => {
    const raw = structuredClone(timeline);
    raw.info.frames.splice(16, 0, structuredClone(raw.info.frames[15]));
    delete raw.info.frames[15].participantFrames['1'];
    const projection = projectTimelineSnapshots(raw, participants);
    expect(projection.frames[15].timestamp).toBe(
      projection.frames[16].timestamp,
    );
    expect(projection.frames[15].frameIndex).not.toBe(
      projection.frames[16].frameIndex,
    );
    expect(snapshotCheckpoint(projection, 1, 900000, 2368000).reason).toBe(
      'missing_participant_frame',
    );
  });
  it('selects nearest or past-only with explicit offset and rejects short games', () => {
    const projection = projectTimelineSnapshots(timeline, participants);
    expect(snapshotCheckpoint(projection, 1, 900000, 2368000)).toMatchObject({
      timestampMs: 900358,
      offsetMs: 358,
    });
    expect(
      snapshotCheckpoint(projection, 1, 900000, 2368000, 'pastOnly'),
    ).toMatchObject({ timestampMs: 840357, offsetMs: -59643 });
    expect(snapshotCheckpoint(projection, 1, 2400000, 2368000).reason).toBe(
      'short_match',
    );
    const decoded = projectionComparisonTimeline(projection);
    expect(decoded.frames).toHaveLength(41);
    expect(decoded.participants).toHaveLength(10);
  });
  it('gold uses both final-minute frames and exposes missing source instead of a fake zero', () => {
    const raw = structuredClone(timeline);
    delete raw.info.frames[39].participantFrames['1'].totalGold;
    const points = computeSnapshotGoldTimeline(
      projectTimelineSnapshots(raw, participants),
      match.info.participants,
    );
    expect(points).toHaveLength(41);
    expect(points[39]).toMatchObject({
      minute: 39,
      timestampMs: 2340765,
      blueTeam: null,
      difference: null,
      reason: 'missing_frame',
    });
    expect(points[40]).toMatchObject({
      minute: 39,
      timestampMs: 2368922,
      difference: 9993,
    });
  });
  it('keeps legacy arrays explicitly lossy with last-frame-in-minute behavior', () => {
    const projection = projectTimelineSnapshots(timeline, participants);
    const puuid = participants.get(1)!;
    const legacy = legacyMinuteGraphs(projection, puuid);
    expect(legacy.goldGraph[39]).toBe(
      projection.frames[40].participantFrames['1'].totalGold,
    );
    expect(legacy.goldGraph).toHaveLength(40);
    const parsed = new TimelineParserService().parseTimeline(
      timeline,
      participants,
    );
    expect(parsed.snapshotProjection).toEqual(projection);
    expect(parsed.participants.get(puuid)?.goldGraph).toEqual(legacy.goldGraph);
  });
  it('does not emit a sampled swing from simultaneous snapshots or gaps over 120 seconds', () => {
    const raw = structuredClone(timeline);
    raw.info.frames = [raw.info.frames[0], raw.info.frames[40]];
    const projected = projectTimelineSnapshots(raw, participants);
    const points = computeSnapshotGoldTimeline(
      projected,
      match.info.participants,
    );
    expect(points[1].timestampMs - points[0].timestampMs).toBeGreaterThan(
      120000,
    );
    expect(findObservedSwing(points)).toBeNull();
    points[1].timestampMs = points[0].timestampMs;
    expect(findObservedSwing(points)).toBeNull();
  });
});
