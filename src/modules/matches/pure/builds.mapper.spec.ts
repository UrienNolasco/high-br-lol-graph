import { mapParticipantBuild, BuildParticipant } from './builds.mapper';

describe('builds.mapper', () => {
  describe('mapParticipantBuild', () => {
    it('should map participant item timeline and final build', () => {
      const p: BuildParticipant = {
        puuid: 'abc',
        championId: 1,
        championName: 'Test',
        itemTimeline: [
          { itemId: 1001, timestamp: 60000, type: 'BUY' },
          { itemId: 1002, timestamp: 120000, type: 'BUY' },
          { itemId: 1001, timestamp: 90000, type: 'SELL' },
        ],
      };

      const result = mapParticipantBuild(p);

      expect(result.puuid).toBe('abc');
      expect(result.itemTimeline).toHaveLength(3);
      expect(result.itemTimeline[0].minute).toBe(1);
      expect(result.finalBuild).toEqual([{ itemId: 1001 }, { itemId: 1002 }]);
    });

    it('should keep last 6 items as final build', () => {
      const items = Array.from({ length: 10 }, (_, i) => ({
        itemId: i + 1,
        timestamp: i * 60000,
        type: 'BUY',
      }));

      const p: BuildParticipant = {
        puuid: 'abc',
        championId: 1,
        championName: 'Test',
        itemTimeline: items,
      };

      const result = mapParticipantBuild(p);

      expect(result.finalBuild).toHaveLength(6);
      expect(result.finalBuild.map((i) => i.itemId)).toEqual([
        5, 6, 7, 8, 9, 10,
      ]);
    });

    it('should handle null itemTimeline', () => {
      const p: BuildParticipant = {
        puuid: 'abc',
        championId: 1,
        championName: 'Test',
        itemTimeline: null,
      };

      const result = mapParticipantBuild(p);

      expect(result.itemTimeline).toEqual([]);
      expect(result.finalBuild).toEqual([]);
    });
  });
});
