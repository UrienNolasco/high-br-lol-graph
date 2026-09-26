import { historicalSolo } from './historical-solo';
import { combatFixture, killEvent } from '../../matches/pure/combat.fixture';
import { CombatSource } from '../../matches/contracts/calculations/combat-source';
const source = (matchId: string): CombatSource => ({
  matchId,
  status: 'COMPLETED',
  processingVersion: 2,
  completedAt: new Date('2026-09-23T00:00:00Z'),
});
describe('MET13 historical solo counts', () => {
  it('distinguishes match counts from means, uses identical selected matches, and excludes unknowns from valid N', () => {
    const inputs = [
      combatFixture([killEvent({ matchId: 'one' })], { matchId: 'one' }),
      combatFixture(
        [0, 1, 2].map((eventIndex) =>
          killEvent({ matchId: 'three', eventIndex }),
        ),
        { matchId: 'three' },
      ),
      combatFixture(
        [
          killEvent({
            matchId: 'unknown',
            assistingPuuids: null,
            assistingParticipantIds: null,
          }),
        ],
        { matchId: 'unknown' },
      ),
    ];
    const rows = inputs.map((input) => ({
      matchId: input.matchId,
      puuid: 'a',
      match: input,
    }));
    const result = historicalSolo(
      rows,
      [
        ...inputs.flatMap((i) => i.events),
        killEvent({ matchId: 'outside-selected-cohort' }),
      ],
      inputs.map((i) => source(i.matchId)),
    );
    expect(result).toMatchObject({
      soloKills15: 2,
      avgSoloKills15: 2,
      soloAggregation: 'mean_per_valid_match',
      soloSamples: { kills15: { validN: 2, totalN: 3, coverage: 2 / 3 } },
    });
    expect(result.soloEvidence.map((e) => e.soloKills15)).toEqual([1, 3, null]);
    expect(result.soloEvidence[2].soloKills15Reason).toBe('unknown_assistance');
    expect(result.soloDeaths15).toBe(0);
  });
  it('missing projections have no valid samples; a completed genuine zero-kill game has zero', () => {
    const match = combatFixture([]);
    const rows = [{ matchId: 'm', puuid: 'a', match }];
    expect(historicalSolo(rows, [], [])).toMatchObject({
      soloKills15: null,
      soloKills15Reason: 'no_valid_samples',
      soloEvidence: [{ soloKills15Reason: 'missing_projection' }],
    });
    expect(historicalSolo(rows, match.events, [source('m')])).toMatchObject({
      soloKills15: 0,
      soloSamples: { kills15: { validN: 1, totalN: 1 } },
    });
  });
});
