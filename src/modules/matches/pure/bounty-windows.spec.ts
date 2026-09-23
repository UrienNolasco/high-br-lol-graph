import { BountyBoundary, interpretBountyWindows } from './bounty-windows';
const boundary = (
  id: number,
  type: BountyBoundary['type'] = 'OBJECTIVE_BOUNTY_PRESTART',
  timestamp = 10000,
  team: number | null = 100,
  actualStartTime: unknown = 20000,
): BountyBoundary => ({
  eventId: `m:1:${id}`,
  frameIndex: 1,
  eventIndex: id,
  type,
  timestampMs: timestamp,
  teamId: team,
  actualStartTime,
});
const finish = (id = 1, time = 30000, team: number | null = 100) =>
  boundary(id, 'OBJECTIVE_BOUNTY_FINISH', time, team, undefined);
describe('O10 recorded bounty intervals', () => {
  it('prefers actualStartTime, matches by explicit team and is input-order independent', () => {
    const events = [
      boundary(0),
      boundary(1, 'OBJECTIVE_BOUNTY_PRESTART', 11000, 200, 21000),
      finish(2, 30000, 200),
      finish(3, 31000, 100),
    ];
    const result = interpretBountyWindows(events, 40000);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      startMs: 20000,
      startSource: 'actualStartTime',
      endMs: 31000,
      teamId: 100,
      censoredEnd: false,
    });
    expect(result[1]).toMatchObject({
      startMs: 21000,
      endMs: 30000,
      teamId: 200,
    });
    expect(interpretBountyWindows([...events].reverse(), 40000)).toEqual(
      result,
    );
  });
  it('falls back only for absent actualStartTime and never replaces a supplied invalid value', () => {
    expect(
      interpretBountyWindows(
        [boundary(0, 'OBJECTIVE_BOUNTY_PRESTART', 10000, 100, null), finish()],
        40000,
      )[0],
    ).toMatchObject({
      startMs: 10000,
      startSource: 'announcement_timestamp',
      reason: null,
    });
    expect(
      interpretBountyWindows(
        [
          boundary(0, 'OBJECTIVE_BOUNTY_PRESTART', 10000, 100, '20000'),
          finish(),
        ],
        40000,
      )[0],
    ).toMatchObject({ startMs: null, reason: 'invalid_value' });
  });
  it('preserves right censoring and missing observation end, never substituting game end for FINISH', () => {
    expect(interpretBountyWindows([boundary(0)], 40000)[0]).toMatchObject({
      endMs: null,
      observedEndMs: 40000,
      censoredEnd: true,
      reason: null,
    });
    expect(interpretBountyWindows([boundary(0)], null)[0]).toMatchObject({
      endMs: null,
      observedEndMs: null,
      censoredEnd: true,
      reason: 'missing_frame',
    });
  });
  it('does not match unknown teams or attach an orphan finish to a guessed start', () => {
    const result = interpretBountyWindows(
      [
        boundary(0, 'OBJECTIVE_BOUNTY_PRESTART', 10000, null),
        finish(1, 30000, null),
      ],
      40000,
    );
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      teamId: null,
      endMs: null,
      reason: 'missing_field',
    });
    expect(result[1]).toMatchObject({
      teamId: null,
      startMs: null,
      censoredStart: true,
    });
    expect(interpretBountyWindows([finish()], 40000)[0]).toMatchObject({
      startMs: null,
      censoredStart: true,
      reason: 'missing_field',
    });
  });
  it('reports ambiguous overlapping announcements without consuming the finish twice', () => {
    const result = interpretBountyWindows(
      [boundary(0), boundary(1), finish(2)],
      40000,
    );
    expect(result).toHaveLength(3);
    expect(result.every((w) => w.reason === 'invalid_value')).toBe(true);
    expect(result.filter((w) => w.finish !== null)).toHaveLength(1);
    expect(result[0].issues).toContain(
      'ambiguous_finish_multiple_announcements',
    );
  });
  it('does not erase prior ambiguity to guess a later finish pairing', () => {
    const result = interpretBountyWindows(
      [
        boundary(0),
        boundary(1),
        finish(2),
        boundary(3, 'OBJECTIVE_BOUNTY_PRESTART', 35000, 100, 36000),
        finish(4, 38000),
      ],
      40000,
    );
    expect(
      result
        .filter((w) => w.announcement !== null)
        .every((w) => w.finish === null && w.reason === 'invalid_value'),
    ).toBe(true);
    expect(result.filter((w) => w.censoredStart)).toHaveLength(2);
  });
  it('allows zero duration but rejects a finish before effective start or events beyond game end', () => {
    expect(
      interpretBountyWindows([boundary(0), finish(1, 20000)], 40000)[0],
    ).toMatchObject({ startMs: 20000, endMs: 20000, reason: null });
    expect(
      interpretBountyWindows([boundary(0), finish(1, 19000)], 40000)[0].reason,
    ).toBe('invalid_value');
    expect(
      interpretBountyWindows([boundary(0), finish(1, 41000)], 40000)[0].reason,
    ).toBe('invalid_value');
    expect(() =>
      interpretBountyWindows([boundary(0), boundary(0)], 40000),
    ).toThrow('Duplicate');
  });
});
