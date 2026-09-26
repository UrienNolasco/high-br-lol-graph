import type { FinalContext, FinalObjectives, FinalStats } from './final-stats';
import type { FinalInventory } from './final-inventory';
import type { ObjectiveEvent } from './normalized-timeline';

export interface NormalizedRunes {
  styles: Array<{
    description: string;
    style: number;
    selections: Array<{
      perk: number;
      var1: number;
      var2: number;
      var3: number;
    }>;
  }>;
  statPerks: { defense: number; flex: number; offense: number };
}

export interface ProcessedMatchData {
  match: {
    populationEligible: boolean;
    populationExclusionReason: string | null;
    matchId: string;
    gameCreation: bigint;
    gameDuration: number;
    gameMode: string;
    queueId: number;
    gameVersion: string;
    mapId: number;
    finalContext: FinalContext;
  };
  teams: Array<{
    matchId: string;
    teamId: number;
    win: boolean;
    bans: number[];
    bansAvailable: boolean;
    objectivesTimeline: ObjectiveEvent[];
    finalObjectives: FinalObjectives;
  }>;
  participants: Array<{
    matchId: string;
    puuid: string;
    summonerName: string;
    riotIdGameName: string | null;
    riotIdTagline: string | null;
    finalStats: FinalStats;
    championId: number;
    championName: string;
    teamId: number;
    role: string;
    lane: string;
    win: boolean;
    kills: number;
    deaths: number;
    assists: number;
    kda: number;
    goldEarned: number;
    totalDamage: number;
    damageTaken: number;
    visionScore: number;
    totalCs: number;
    runes: NormalizedRunes;
    challenges: Record<string, number | string | boolean | number[]>;
    pings: Record<string, number>;
    spells: number[];
    finalInventory: FinalInventory;
  }>;
}
