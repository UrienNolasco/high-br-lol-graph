import {
  flattenKills,
  flattenDeaths,
  flattenWards,
  flattenObjectives,
  EventParticipant,
  EventTeam,
} from './timeline-events.mapper';

describe('timeline-events.mapper', () => {
  describe('flattenKills', () => {
    it('should flatten kill positions from participants', () => {
      const participants: EventParticipant[] = [
        {
          puuid: 'p1',
          championId: 1,
          killPositions: [{ x: 100, y: 200, timestamp: 120000 }],
          deathPositions: null,
          wardPositions: null,
        },
      ];

      const result = flattenKills(participants);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        puuid: 'p1',
        championId: 1,
        x: 100,
        y: 200,
        timestamp: 120000,
        minute: 2,
      });
    });

    it('should handle null killPositions', () => {
      const participants: EventParticipant[] = [
        {
          puuid: 'p1',
          championId: 1,
          killPositions: null,
          deathPositions: null,
          wardPositions: null,
        },
      ];

      expect(flattenKills(participants)).toEqual([]);
    });

    it('should handle empty participants', () => {
      expect(flattenKills([])).toEqual([]);
    });
  });

  describe('flattenDeaths', () => {
    it('should flatten death positions from participants', () => {
      const participants: EventParticipant[] = [
        {
          puuid: 'p2',
          championId: 10,
          killPositions: null,
          deathPositions: [{ x: 500, y: 600, timestamp: 300000 }],
          wardPositions: null,
        },
      ];

      const result = flattenDeaths(participants);

      expect(result).toHaveLength(1);
      expect(result[0].minute).toBe(5);
    });

    it('should handle null deathPositions', () => {
      const participants: EventParticipant[] = [
        {
          puuid: 'p1',
          championId: 1,
          killPositions: null,
          deathPositions: null,
          wardPositions: null,
        },
      ];

      expect(flattenDeaths(participants)).toEqual([]);
    });
  });

  describe('flattenWards', () => {
    it('should flatten ward positions from participants', () => {
      const participants: EventParticipant[] = [
        {
          puuid: 'p3',
          championId: 20,
          killPositions: null,
          deathPositions: null,
          wardPositions: [
            { wardType: 'CONTROL_WARD', x: 800, y: 900, timestamp: 60000 },
          ],
        },
      ];

      const result = flattenWards(participants);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        wardType: 'CONTROL_WARD',
        minute: 1,
      });
    });

    it('should handle null wardPositions', () => {
      const participants: EventParticipant[] = [
        {
          puuid: 'p1',
          championId: 1,
          killPositions: null,
          deathPositions: null,
          wardPositions: null,
        },
      ];

      expect(flattenWards(participants)).toEqual([]);
    });
  });

  describe('flattenObjectives', () => {
    it('should flatten objectives from teams', () => {
      const teams: EventTeam[] = [
        {
          teamId: 100,
          objectivesTimeline: [
            {
              type: 'DRAGON',
              subType: 'FIRE',
              teamId: 200,
              timestamp: 300000,
              killerId: 1,
            },
          ],
        },
      ];

      const result = flattenObjectives(teams);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        type: 'DRAGON',
        subType: 'FIRE',
        teamId: 200,
        minute: 5,
      });
    });

    it('should use obj.teamId when provided', () => {
      const teams: EventTeam[] = [
        {
          teamId: 100,
          objectivesTimeline: [
            {
              type: 'BARON',
              subType: '',
              teamId: 200,
              timestamp: 600000,
              killerId: 2,
            },
          ],
        },
      ];

      const result = flattenObjectives(teams);

      expect(result[0].teamId).toBe(200);
    });
  });
});
