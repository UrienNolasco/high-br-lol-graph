import { MatchContributionService } from './match-contribution.service';
import { contributionFixture } from '../../../../test/fixtures/contribution';

describe('MatchContributionService', () => {
  const repo = { findContribution: jest.fn() };
  const service = new MatchContributionService(repo as any);
  beforeEach(() => jest.clearAllMocks());
  it('uses persisted projection metadata and exposes the four dimensions', async () => {
    const fixture = contributionFixture();
    repo.findContribution.mockResolvedValue(fixture);
    const response = await service.getContribution(
      fixture.match.matchId,
      fixture.match.participants[0].puuid,
    );
    expect(Object.keys(response.dimensions!)).toEqual([
      'resources',
      'combat',
      'vision',
      'structures',
    ]);
    expect(response.processedAt).toBe(
      fixture.processing.completedAt.toISOString(),
    );
    expect(response.reason).toBeNull();
  });
  it('does not invent processing metadata for a legacy/unprocessed row', async () => {
    const fixture = contributionFixture();
    for (const processing of [
      null,
      { status: 'PENDING', processingVersion: null, completedAt: null },
    ]) {
      repo.findContribution.mockResolvedValue({ ...fixture, processing });
      expect(
        await service.getContribution(
          fixture.match.matchId,
          fixture.match.participants[0].puuid,
        ),
      ).toMatchObject({
        dimensions: null,
        processedAt: null,
        processingVersion: null,
        reason: 'not_calculated',
      });
    }
  });
  it('distinguishes a missing match and a missing participant from unavailable metrics', async () => {
    repo.findContribution.mockResolvedValue({ match: null, processing: null });
    await expect(service.getContribution('BR1_404', 'missing')).rejects.toThrow(
      'Match BR1_404 not found',
    );
    repo.findContribution.mockResolvedValue(contributionFixture());
    await expect(
      service.getContribution('BR1_3200579475', 'missing'),
    ).rejects.toThrow('Player missing not found');
  });
});
