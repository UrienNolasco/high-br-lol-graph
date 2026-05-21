import {
  computeGoldTimeline,
  determineWinner,
  findMaxAdvantage,
  findThrowPoint,
  GoldParticipant,
} from './gold-calculator';

describe('gold-calculator', () => {
  describe('computeGoldTimeline', () => {
    it('should compute gold difference per minute', () => {
      const participants: GoldParticipant[] = [
        { teamId: 100, goldGraph: [500, 800, 1200] },
        { teamId: 100, goldGraph: [500, 800, 1200] },
        { teamId: 200, goldGraph: [500, 700, 1000] },
        { teamId: 200, goldGraph: [500, 800, 1100] },
      ];

      const result = computeGoldTimeline(participants);

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({
        minute: 0,
        blueTeam: 1000,
        redTeam: 1000,
        difference: 0,
      });
      expect(result[2]).toEqual({
        minute: 2,
        blueTeam: 2400,
        redTeam: 2100,
        difference: 300,
      });
    });

    it('should handle empty participants', () => {
      expect(computeGoldTimeline([])).toEqual([]);
    });

    it('should handle uneven graph lengths', () => {
      const participants: GoldParticipant[] = [
        { teamId: 100, goldGraph: [500, 800] },
        { teamId: 200, goldGraph: [500, 800, 1100, 1400] },
      ];

      const result = computeGoldTimeline(participants);

      expect(result).toHaveLength(4);
      expect(result[2].redTeam).toBe(1100);
      expect(result[3].blueTeam).toBe(0);
      expect(result[3].redTeam).toBe(1400);
    });
  });

  describe('determineWinner', () => {
    it('should return blueTeam when blue has positive final diff', () => {
      const diff = [
        { minute: 0, blueTeam: 500, redTeam: 500, difference: 0 },
        { minute: 1, blueTeam: 1000, redTeam: 500, difference: 500 },
      ];
      expect(determineWinner(diff)).toBe('blueTeam');
    });

    it('should return redTeam when blue has negative final diff', () => {
      const diff = [
        { minute: 0, blueTeam: 500, redTeam: 500, difference: 0 },
        { minute: 1, blueTeam: 500, redTeam: 1000, difference: -500 },
      ];
      expect(determineWinner(diff)).toBe('redTeam');
    });

    it('should return redTeam when no data', () => {
      expect(determineWinner([])).toBe('redTeam');
    });
  });

  describe('findMaxAdvantage', () => {
    it('should find the peak advantage', () => {
      const diff = [
        { minute: 0, blueTeam: 500, redTeam: 500, difference: 0 },
        { minute: 1, blueTeam: 500, redTeam: 1000, difference: -500 },
        { minute: 2, blueTeam: 500, redTeam: 500, difference: 0 },
      ];

      const result = findMaxAdvantage(diff);

      expect(result.minute).toBe(1);
      expect(result.team).toBe('redTeam');
      expect(result.difference).toBe(500);
    });

    it('should return first entry as max when all equal', () => {
      const diff = [
        { minute: 0, blueTeam: 500, redTeam: 500, difference: 0 },
        { minute: 1, blueTeam: 600, redTeam: 600, difference: 0 },
      ];

      expect(findMaxAdvantage(diff).minute).toBe(0);
    });
  });

  describe('findThrowPoint', () => {
    it('should detect a throw when swing exceeds threshold', () => {
      const diff = [
        { minute: 0, blueTeam: 500, redTeam: 500, difference: 0 },
        { minute: 1, blueTeam: 5000, redTeam: 500, difference: 4500 },
        { minute: 2, blueTeam: 500, redTeam: 3500, difference: -3000 },
      ];

      const result = findThrowPoint(diff);

      expect(result).not.toBeNull();
      expect(result!.minute).toBe(1);
      expect(result!.swing).toBe(4500);
    });

    it('should return null when no throw', () => {
      const diff = [
        { minute: 0, blueTeam: 500, redTeam: 500, difference: 0 },
        { minute: 1, blueTeam: 800, redTeam: 500, difference: 300 },
      ];

      expect(findThrowPoint(diff)).toBeNull();
    });

    it('should return first throw point only', () => {
      const diff = [
        { minute: 0, blueTeam: 1000, redTeam: 1000, difference: 0 },
        { minute: 1, blueTeam: 5000, redTeam: 1000, difference: 4000 },
        { minute: 2, blueTeam: 1000, redTeam: 5000, difference: -4000 },
      ];

      const result = findThrowPoint(diff);
      expect(result!.minute).toBe(1);
    });
  });
});
