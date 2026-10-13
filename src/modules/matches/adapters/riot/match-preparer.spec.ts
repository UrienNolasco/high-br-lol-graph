import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import type { MatchDto } from '../../../../core/riot/dto/match.dto';
import type { TimelineDto } from '../../../../core/riot/dto/timeline.dto';
import { InvalidMatchError } from '../../../../lib/processing-errors';
import { PROCESSING_VERSION } from '../../../../lib/processing-policy';
import { RiotMatchPreparer } from './match-preparer';
import { TimelineParserService } from './timeline-parser.service';

const matchId = 'BR1_3283642155';
const load = (kind: string): unknown =>
  JSON.parse(
    gunzipSync(
      readFileSync(
        join(
          __dirname,
          '../../../../../test/fixtures/riot-identity',
          `${matchId}.${kind}.json.gz`,
        ),
      ),
    ).toString(),
  );
const fixture = () => ({
  summary: load('summary') as MatchDto,
  timeline: load('timeline') as TimelineDto,
});
const preparer = new RiotMatchPreparer(new TimelineParserService());
const prepare = (summary: MatchDto, timeline: TimelineDto) =>
  preparer.prepare(matchId, summary, timeline, PROCESSING_VERSION);

it('accepts the unchanged real shuffled-metadata match and preserves every explicit snapshot/event identity', () => {
  const { summary, timeline } = fixture();
  const original = structuredClone({ summary, timeline });
  const identities = new Map(
    summary.info.participants.map((p) => [p.participantId, p.puuid]),
  );
  expect(timeline.metadata.participants[0]).not.toBe(identities.get(1));
  const prepared = prepare(summary, timeline);
  expect(prepared.timeline.normalizedEvents).toHaveLength(733);
  expect(prepared.timeline.snapshotProjection.frames).toHaveLength(20);
  for (const frame of prepared.timeline.snapshotProjection.frames)
    for (const participant of Object.values(frame.participantFrames))
      expect(participant.puuid).toBe(identities.get(participant.participantId));
  for (const event of prepared.timeline.normalizedEvents) {
    expect(event.actorPuuid).toBe(
      identities.get(event.actorParticipantId ?? 0) ?? null,
    );
    expect(event.victimPuuid).toBe(
      identities.get(event.victimParticipantId ?? 0) ?? null,
    );
    if (event.assistingParticipantIds)
      expect(event.assistingPuuids).toEqual(
        event.assistingParticipantIds.map((id) => identities.get(id) ?? null),
      );
  }
  expect({ summary, timeline }).toEqual(original);
  timeline.metadata.participants.reverse();
  timeline.info.participants!.reverse();
  expect(prepare(summary, timeline)).toEqual(prepared);
});

it.each([
  [
    'unknown frame ID',
    (timeline: TimelineDto) => {
      timeline.info.frames[0].participantFrames[99] = {
        ...timeline.info.frames[0].participantFrames[1],
        participantId: 99,
      };
    },
  ],
  [
    'frame key/ID mismatch',
    (timeline: TimelineDto) => {
      timeline.info.frames[0].participantFrames[1].participantId = 2;
    },
  ],
  [
    'null explicit identities',
    (timeline: TimelineDto) => {
      Object.assign(timeline.info, { participants: null });
    },
  ],
] as const)('rejects %s before timeline parsing', (_name, mutate) => {
  const { summary, timeline } = fixture();
  mutate(timeline);
  expect(() => prepare(summary, timeline)).toThrow(InvalidMatchError);
});
