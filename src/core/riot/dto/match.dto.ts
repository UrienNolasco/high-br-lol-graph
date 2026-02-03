/**
 * DTOs para Match V5 da Riot API
 * Documentação: https://developer.riotgames.com/apis#match-v5
 */

export interface MatchDto {
  metadata: MatchMetadata;
  info: MatchInfo;
}

export interface MatchMetadata {
  matchId: string;
  participants: string[];
}

export interface MatchInfo {
  gameCreation: number;
  gameDuration: number;
  gameMode: string;
  gameName: string;
  gameStartTimestamp: number;
  gameType: string;
  gameVersion: string;
  mapId: number;
  queueId: number;
  participants: ParticipantDto[];
  platformId: string;
  teams: TeamDto[];
  tournamentCode: string;
}

export interface ParticipantDto {
  allInPings: number;
  assistMePings: number;
  assists: number;
  baronKills: number;
  basicPings: number;
  bountyLevel: number;
  champExperience: number;
  champLevel: number;
  championId: number;
  championName: string;
  championTransform: number;
  commandPings: number;
  consumablesPurchased: number;
  damageDealtToBuildings: number;
  damageDealtToObjectives: number;
  damageDealtToTurrets: number;
  damageSelfMitigated: number;
  dangerPings: number;
  deaths: number;
  doubleKills: number;
  dragonKills: number;
  eligibleForProgression: boolean;
  enemyMissingPings: number;
  enemyVisionPings: number;
  firstBloodAssist: boolean;
  firstBloodKill: boolean;
  firstTowerAssist: boolean;
  firstTowerKill: boolean;
  goldEarned: number;
  goldSpent: number;
  holdPings: number;
  inhibitorKills: number;
  inhibitorTakedowns: number;
  item0: number;
  item1: number;
  item2: number;
  item3: number;
  item4: number;
  item5: number;
  item6: number;
  itemsPurchased: number;
  killingSprees: number;
  kills: number;
  lane: string;
  largestCriticalStrike: number;
  largestKillingSpree: number;
  largestMultiKill: number;
  longestTimeSpentLiving: number;
  magicDamageDealt: number;
  magicDamageDealtToChampions: number;
  magicDamageTaken: number;
  neutralMinionsKilled: number;
  nexusKills: number;
  nexusTakedowns: number;
  nexusLost: number;
  objectivesStolen: number;
  objectivesStolenAssists: number;
  onMyWayPings: number;
  participantId: number;
  pings: unknown[];
  pentakills: number;
  physicalDamageDealt: number;
  physicalDamageDealtToChampions: number;
  physicalDamageTaken: number;
  platformId: string;
  profileIcon: number;
  puuid: string;
  quadraKills: number;
  riotIdGameName: string;
  riotIdTagline: string;
  role: string;
  sightWardsBoughtInGame: number;
  spell1Casts: number;
  spell2Casts: number;
  spell3Casts: number;
  spell4Casts: number;
  summoner1Id: number;
  summoner1Casts: number;
  summoner2Id: number;
  summoner2Casts: number;
  summonerLevel: number;
  summonerName: string;
  teamEarlySurrendered: number;
  teamId: number;
  teamPosition: string;
  timeCCingOthers: number;
  timePlayed: number;
  totalDamageDealt: number;
  totalDamageDealtToChampions: number;
  totalDamageShieldedOnTeammates: number;
  totalDamageTaken: number;
  totalHeal: number;
  totalHealsOnTeammates: number;
  totalMinionsKilled: number;
  totalTimeCCDealt: number;
  totalTimeSpentDead: number;
  totalUnitsHealed: number;
  tripleKills: number;
  trueDamageDealt: number;
  trueDamageDealtToChampions: number;
  trueDamageTaken: number;
  turretKills: number;
  turretTakedowns: number;
  unrealKills: number;
  visionScore: number;
  visionWardsBoughtInGame: number;
  win: boolean;
  individualPosition: string;
  perks: PerksDto;
  challenges: Record<string, number | string | boolean | number[]>;
}

export interface PerksDto {
  styles: PerkStyleDto[];
  statPerks: StatPerksDto;
}

export interface PerkStyleDto {
  description: string;
  selections: PerkSelectionDto[];
  style: number;
}

export interface PerkSelectionDto {
  perk: number;
  var1: number;
  var2: number;
  var3: number;
}

export interface StatPerksDto {
  defense: number;
  flex: number;
  offense: number;
}

export interface BanDto {
  championId: number;
  pickTurn: number;
}

export interface TeamDto {
  bans: BanDto[];
  objectives: TeamObjectivesDto;
  teamId: number;
  win: boolean;
}

export interface TeamObjectivesDto {
  baron: TeamObjectiveDto;
  champion: TeamObjectiveDto;
  dragon: TeamObjectiveDto;
  inhibitor: TeamObjectiveDto;
  riftHerald: TeamObjectiveDto;
  tower: TeamObjectiveDto;
}

export interface TeamObjectiveDto {
  first: boolean;
  kills: number;
  lost: boolean;
}

// DTOs legados para compatibilidade
export interface ChampionData {
  version: string;
  id: string;
  key: string;
  name: string;
  title: string;
}

export interface ChampionsData {
  type: string;
  format: string;
  version: string;
  data: Record<string, ChampionData>;
}
