import { buildParticipantMap, parseMatchData } from './match.parser';
import { extractPatch } from '../../contracts/calculations/patch';
import { InvalidMatchError } from '../../../../lib/processing-errors';

describe('match.parser', () => {
  describe('buildParticipantMap', () => {
    it('maps explicit IDs independently of summary, timeline and metadata order', () => {
      const map = buildParticipantMap(
        ['puuid-3', 'puuid-1', 'puuid-2'],
        [
          { participantId: 8, puuid: 'puuid-2' },
          { participantId: 3, puuid: 'puuid-1' },
          { participantId: 12, puuid: 'puuid-3' },
        ],
        [
          { participantId: 12, puuid: 'puuid-3' },
          { participantId: 8, puuid: 'puuid-2' },
          { participantId: 3, puuid: 'puuid-1' },
        ],
      );
      expect(map).toEqual(
        new Map([
          [3, 'puuid-1'],
          [8, 'puuid-2'],
          [12, 'puuid-3'],
        ]),
      );
    });

    it('uses explicit summary IDs when older payloads omit timeline pairs', () => {
      expect(
        buildParticipantMap(
          ['b', 'a'],
          [
            { participantId: 1, puuid: 'a' },
            { participantId: 2, puuid: 'b' },
          ],
        ),
      ).toEqual(
        new Map([
          [1, 'a'],
          [2, 'b'],
        ]),
      );
    });

    it.each([
      [
        'unknown metadata PUUID',
        ['a', 'missing'],
        [
          { participantId: 1, puuid: 'a' },
          { participantId: 2, puuid: 'b' },
        ],
      ],
      [
        'duplicate metadata PUUID',
        ['a', 'a'],
        [
          { participantId: 1, puuid: 'a' },
          { participantId: 2, puuid: 'b' },
        ],
      ],
      [
        'missing metadata PUUID',
        ['a'],
        [
          { participantId: 1, puuid: 'a' },
          { participantId: 2, puuid: 'b' },
        ],
      ],
      [
        'duplicate summary ID',
        ['a', 'b'],
        [
          { participantId: 1, puuid: 'a' },
          { participantId: 1, puuid: 'b' },
        ],
      ],
      [
        'duplicate summary PUUID',
        ['a', 'b'],
        [
          { participantId: 1, puuid: 'a' },
          { participantId: 2, puuid: 'a' },
        ],
      ],
      ['zero ID', ['a'], [{ participantId: 0, puuid: 'a' }]],
      ['negative ID', ['a'], [{ participantId: -1, puuid: 'a' }]],
      ['fractional ID', ['a'], [{ participantId: 1.5, puuid: 'a' }]],
    ] as const)('rejects %s', (_name, metadata, participants) => {
      expect(() => buildParticipantMap(metadata, participants)).toThrow(
        InvalidMatchError,
      );
    });

    it.each([
      [
        'contradictory timeline pairs',
        [
          { participantId: 1, puuid: 'b' },
          { participantId: 2, puuid: 'a' },
        ],
      ],
      [
        'duplicate timeline ID',
        [
          { participantId: 1, puuid: 'a' },
          { participantId: 1, puuid: 'a' },
        ],
      ],
      [
        'unknown timeline ID',
        [
          { participantId: 1, puuid: 'a' },
          { participantId: 3, puuid: 'b' },
        ],
      ],
      ['missing timeline participant', [{ participantId: 1, puuid: 'a' }]],
      ['empty timeline pairs', []],
    ] as const)(
      'rejects %s even when metadata membership agrees',
      (_name, timeline) => {
        expect(() =>
          buildParticipantMap(
            ['a', 'b'],
            [
              { participantId: 1, puuid: 'a' },
              { participantId: 2, puuid: 'b' },
            ],
            timeline,
          ),
        ).toThrow(InvalidMatchError);
      },
    );
  });

  describe('parseMatchData', () => {
    const baseMatchDto = {
      metadata: { matchId: 'BR1_1' },
      info: {
        gameCreation: 1700000000000,
        gameDuration: 1800,
        gameMode: 'CLASSIC',
        queueId: 420,
        gameVersion: '15.1.1',
        mapId: 11,
        teams: [
          { teamId: 100, win: true, bans: [{ championId: 1 }], objectives: {} },
        ],
        participants: [
          {
            puuid: 'p1',
            summonerName: 'Test',
            championId: 1,
            championName: 'Annie',
            teamId: 100,
            teamPosition: 'MIDDLE',
            lane: 'MIDDLE',
            individualPosition: 'MIDDLE',
            win: true,
            kills: 5,
            deaths: 3,
            assists: 10,
            goldEarned: 12000,
            totalDamageDealtToChampions: 25000,
            totalDamageTaken: 15000,
            visionScore: 30,
            perks: {},
            challenges: {},
            summoner1Id: 4,
            summoner2Id: 14,
          },
        ],
      },
    } as any;

    it('should parse match metadata', () => {
      const result = parseMatchData(baseMatchDto);
      expect(result.match.matchId).toBe('BR1_1');
      expect(result.match.gameCreation).toBe(BigInt(1700000000000));
      expect(result.match.gameDuration).toBe(1800);
      expect(result.match.queueId).toBe(420);
      expect(result.match.gameVersion).toBe('15.1.1');
    });

    it('should parse teams with bans', () => {
      const result = parseMatchData(baseMatchDto);
      expect(result.teams).toHaveLength(1);
      expect(result.teams[0].teamId).toBe(100);
      expect(result.teams[0].win).toBe(true);
      expect(result.teams[0].bans).toEqual([1]);
    });

    it('should filter out championId 0 from bans', () => {
      const dto = {
        ...baseMatchDto,
        info: {
          ...baseMatchDto.info,
          teams: [
            {
              teamId: 100,
              win: true,
              bans: [{ championId: 0 }, { championId: 1 }],
              objectives: {},
            },
          ],
        },
      };
      const result = parseMatchData(dto);
      expect(result.teams[0].bans).toEqual([1]);
    });

    it('should parse participant stats', () => {
      const result = parseMatchData(baseMatchDto);
      const p = result.participants[0];
      expect(p.puuid).toBe('p1');
      expect(p.championId).toBe(1);
      expect(p.kills).toBe(5);
      expect(p.deaths).toBe(3);
      expect(p.assists).toBe(10);
      expect(p.kda).toBe(5);
      expect(p.goldEarned).toBe(12000);
      expect(p.win).toBe(true);
      expect(p.spells).toEqual([4, 14]);
    });

    it('should calculate KDA with deaths = 1 when deaths is 0', () => {
      const dto = {
        ...baseMatchDto,
        info: {
          ...baseMatchDto.info,
          participants: [
            {
              ...baseMatchDto.info.participants[0],
              deaths: 0,
              kills: 10,
              assists: 5,
            },
          ],
        },
      };
      const result = parseMatchData(dto);
      expect(result.participants[0].kda).toBe(15);
    });

    it('should handle no teams gracefully', () => {
      const dto = {
        ...baseMatchDto,
        info: { ...baseMatchDto.info, teams: undefined },
      };
      const result = parseMatchData(dto);
      expect(result.teams).toEqual([]);
    });
  });

  describe('extractPatch', () => {
    it('should extract major.minor from version string', () => {
      expect(extractPatch('15.23.1')).toBe('15.23');
      expect(extractPatch('15.1.555')).toBe('15.1');
      expect(extractPatch('1.0.0')).toBe('1.0');
    });
  });
});
