import { calculateMapPresence } from './map-presence-calculator';
import {
  mapPresenceFixture,
  mapPresenceTimeline,
} from '../../../../test/fixtures/map-presence';
import { TimelineParserService } from '../../../core/riot/timeline-parser.service';
function synthetic() {
  const input = mapPresenceFixture(),
    template = input.projection!.frames[0];
  input.projection!.frames = [0, 600000, 1200000, 1220000].map(
    (timestamp, frameIndex) => ({
      ...structuredClone(template),
      timestamp,
      frameIndex,
    }),
  );
  input.projection!.observedEndMs = 1220000;
  for (const frame of input.projection!.frames)
    for (const p of Object.values(frame.participantFrames))
      p.position =
        frame.frameIndex % 2 ? { x: 12000, y: 12000 } : { x: 1000, y: 1000 };
  return input;
}
describe('B08 sampled player presence', () => {
  it('reconciles all410 real positions and phase denominators independently against coordinate bands', () => {
    const input = mapPresenceFixture(),
      ids = [
        'southwest',
        'south',
        'southeast',
        'west',
        'center',
        'east',
        'northwest',
        'north',
        'northeast',
      ];
    for (const player of input.participants) {
      const id = mapPresenceTimeline.info.participants.find(
        (p) => p.puuid === player.puuid,
      ).participantId;
      const report = calculateMapPresence(input, player.puuid),
        counts = Array<number>(9).fill(0);
      for (const raw of mapPresenceTimeline.info.frames) {
        const p = raw.participantFrames[id].position;
        const column = p.x <= 5000 ? 0 : p.x <= 10000 ? 1 : 2,
          row = p.y <= 5000 ? 0 : p.y <= 10000 ? 1 : 2;
        counts[row * 3 + column]++;
      }
      expect(report.quality).toMatchObject({
        validSamples: 41,
        totalSamples: 41,
        coverage: 1,
      });
      for (const [index, region] of report.absolute.entries())
        expect(region).toMatchObject({
          regionId: ids[index],
          sampleCount: counts[index],
          fraction: counts[index] / 41,
        });
      expect(
        report.phases.reduce((n, p) => n + p.quality.validSamples, 0),
      ).toBe(41);
      expect(report.sampling.validPositions.intervals.at(-1)?.elapsedMs).toBe(
        28157,
      );
      expect(report.processedAt).toBe('2026-09-23T00:00:00.000Z');
    }
  });
  it('assigns phase boundaries once and exposes equal sample weights plus partial final cadence', () => {
    const input = synthetic(),
      report = calculateMapPresence(input, input.participants[0].puuid);
    expect(report.phases.map((p) => p.quality.validSamples)).toEqual([1, 1, 2]);
    expect(
      report.absolute.find((r) => r.regionId === 'southwest')?.fraction,
    ).toBe(0.5);
    expect(
      report.absolute.find((r) => r.regionId === 'northeast')?.fraction,
    ).toBe(0.5);
    expect(report.sampling.frames.positiveIntervalMs).toEqual({
      min: 20000,
      max: 600000,
      median: 600000,
    });
    expect(report.sampling.frames.frequencyHz).toBeCloseTo(3 / 1220, 12);
    expect(report.sampling.declaredFrameIntervalMs).toBe(60000);
    expect(report.phases[2].bounds).toBe('[]');
  });
  it('exposes exclusions for missing coordinates, domain, participant and timestamp without denominator dilution', () => {
    const input = synthetic(),
      puuid = input.participants[0].puuid,
      frames = input.projection!.frames;
    const key = Object.keys(frames[0].participantFrames).find(
      (k) => frames[0].participantFrames[k].puuid === puuid,
    )!;
    frames[0].participantFrames[key].position = null;
    frames[1].participantFrames[key].position = { x: 16000, y: 2 };
    delete frames[2].participantFrames[key];
    const report = calculateMapPresence(input, puuid);
    expect(report.quality).toMatchObject({
      validSamples: 1,
      totalSamples: 4,
      coverage: 0.25,
    });
    expect(report.excludedReasons).toEqual({
      missing_position: 1,
      outside_definition_domain: 1,
      missing_participant_frame: 1,
    });
    expect(
      report.absolute.find((r) => r.regionId === 'northeast')?.fraction,
    ).toBe(1);
    expect(report.phases[0].absolute.every((r) => r.fraction === null)).toBe(
      true,
    );
    frames[3].timestamp = null;
    const none = calculateMapPresence(input, puuid);
    expect(none.reason).toBe('zero_denominator');
    expect(none.evidence.unassignedTimestampN).toBe(1);
    expect(none.phases.reduce((n, p) => n + p.quality.totalSamples, 0)).toBe(3);
  });
  it('keeps coordinate zero valid but rejects nonfinite coordinates without serializing NaN', () => {
    const input = synthetic(),
      puuid = input.participants[0].puuid;
    const p = Object.values(input.projection!.frames[0].participantFrames).find(
      (p) => p.puuid === puuid,
    )!;
    p.position = { x: 0, y: 0 };
    expect(calculateMapPresence(input, puuid).samples[0]).toMatchObject({
      regionId: 'southwest',
      reason: null,
    });
    p.position = { x: NaN, y: 0 };
    expect(calculateMapPresence(input, puuid).samples[0]).toMatchObject({
      position: null,
      regionId: null,
      reason: 'invalid_position',
    });
  });
  it('keeps equal timestamp samples and reports zero intervals while frequency uses unique times', () => {
    const input = synthetic();
    input.projection!.frames[1].timestamp = 0;
    const report = calculateMapPresence(input, input.participants[0].puuid);
    expect(report.quality.validSamples).toBe(4);
    expect(report.sampling.frames).toMatchObject({
      sampleN: 4,
      uniqueTimestampN: 3,
      zeroIntervalN: 1,
    });
    expect(report.sampling.frames.frequencyHz).toBeCloseTo(2 / 1220, 12);
  });
  it('does not guess unsupported map/patch, old processing generation, missing provenance or projection', () => {
    for (const mutate of [
      (i) => (i.mapId = 12),
      (i) => (i.gameVersion = '16.20.1'),
      (i) => (i.processing!.processingVersion = 1),
      (i) => (i.processing = null),
      (i) => (i.projection = null),
    ]) {
      const input = synthetic();
      mutate(input);
      const report = calculateMapPresence(input, input.participants[0].puuid);
      expect(report.reason).not.toBeNull();
      expect(report.quality.validSamples).toBe(0);
      expect(report.absolute.every((r) => r.fraction === null)).toBe(true);
      expect(report.sampling.frames.frequencyHz).toBeNull();
      if (!input.processing) expect(report.processedAt).toBeNull();
    }
  });
  it('rotates by side without changing source coordinates and preserves absolute data for unknown side', () => {
    const input = synthetic(),
      player = input.participants[0];
    player.teamId = 200;
    let report = calculateMapPresence(input, player.puuid);
    expect(report.samples[0]).toMatchObject({
      position: { x: 1000, y: 1000 },
      regionId: 'southwest',
      teamRelativeRegionId: 'northeast',
    });
    player.teamId = 0;
    report = calculateMapPresence(input, player.puuid);
    expect(report).toMatchObject({
      teamRelative: null,
      teamRelativeReason: 'unsupported_team',
    });
    expect(report.quality.validSamples).toBe(4);
  });
  it('censors short phases with no reversed windows and counts a sample at match end exactly once', () => {
    const input = synthetic();
    input.projection!.observedEndMs = 600000;
    const report = calculateMapPresence(input, input.participants[0].puuid);
    expect(report.quality).toMatchObject({ validSamples: 2, totalSamples: 4 });
    expect(report.excludedReasons.outside_observed_duration).toBe(2);
    expect(report.phases.map((p) => p.quality.validSamples)).toEqual([1, 1, 0]);
    expect(
      report.phases.every(
        (p) =>
          p.targetEndMs >= p.targetStartMs &&
          p.observedEndMs >= p.observedStartMs,
      ),
    ).toBe(true);
  });
  it('never projects a player snapshot onto a ward without event coordinates', () => {
    const raw = structuredClone(mapPresenceTimeline),
      ward = raw.info.frames
        .flatMap((f) => f.events)
        .find((e) => e.type === 'WARD_PLACED');
    delete ward.position;
    const participantMap = new Map<number, string>(
      raw.info.participants.map((p) => [p.participantId, p.puuid]),
    );
    const parsed = new TimelineParserService().parseTimeline(
      raw,
      participantMap,
      new Map(),
      4,
    );
    const placement = parsed.participants
      .get(participantMap.get(ward.creatorId)!)!
      .wardPositions.find((w) => w.timestamp === ward.timestamp)!;
    expect(placement).toMatchObject({ x: null, y: null });
    const input = mapPresenceFixture();
    input.projection = parsed.snapshotProjection;
    const report = calculateMapPresence(
      input,
      participantMap.get(ward.creatorId)!,
    );
    expect(report.quality.validSamples).toBeGreaterThan(0);
    expect(report.evidence).toMatchObject({
      subjectKind: 'player',
      wardPositionsUsed: false,
    });
  });
});
