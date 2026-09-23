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
  gameStartTimestamp?: number | null;
  gameEndTimestamp?: number | null;
  gameId?: number | null;
  endOfGameResult?: string | null;
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
  damageDealtToBuildings?: number | null;
  damageDealtToObjectives?: number | null;
  damageDealtToTurrets?: number | null;
  damageSelfMitigated?: number | null;
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
  roleBoundItem?: number | null;
  itemsPurchased: number;
  killingSprees: number;
  kills: number;
  lane: string;
  largestCriticalStrike: number;
  largestKillingSpree: number;
  largestMultiKill: number;
  longestTimeSpentLiving: number;
  magicDamageDealt?: number | null;
  magicDamageDealtToChampions?: number | null;
  magicDamageTaken?: number | null;
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
  physicalDamageDealt?: number | null;
  physicalDamageDealtToChampions?: number | null;
  physicalDamageTaken?: number | null;
  platformId: string;
  profileIcon: number;
  puuid: string;
  quadraKills: number;
  riotIdGameName?: string | null;
  riotIdTagline?: string | null;
  role: string;
  sightWardsBoughtInGame?: number | null;
  spell1Casts?: number | null;
  spell2Casts?: number | null;
  spell3Casts?: number | null;
  spell4Casts?: number | null;
  summoner1Id: number;
  summoner1Casts?: number | null;
  summoner2Id: number;
  summoner2Casts?: number | null;
  summonerLevel: number;
  summonerName: string;
  teamEarlySurrendered?: boolean | null;
  gameEndedInSurrender?: boolean | null;
  gameEndedInEarlySurrender?: boolean | null;
  teamId: number;
  teamPosition: string;
  timeCCingOthers?: number | null;
  timePlayed?: number | null;
  totalDamageDealt?: number | null;
  totalDamageDealtToChampions: number;
  totalDamageShieldedOnTeammates?: number | null;
  totalDamageTaken: number;
  totalHeal?: number | null;
  totalHealsOnTeammates?: number | null;
  totalMinionsKilled: number;
  totalAllyJungleMinionsKilled?: number | null;
  totalEnemyJungleMinionsKilled?: number | null;
  wardsPlaced?: number | null;
  wardsKilled?: number | null;
  detectorWardsPlaced?: number | null;
  damageDealtToEpicMonsters?: number | null;
  totalTimeCCDealt?: number | null;
  totalTimeSpentDead?: number | null;
  totalUnitsHealed?: number | null;
  tripleKills: number;
  trueDamageDealt?: number | null;
  trueDamageDealtToChampions?: number | null;
  trueDamageTaken?: number | null;
  turretKills: number;
  turretTakedowns: number;
  unrealKills: number;
  visionScore: number;
  visionWardsBoughtInGame?: number | null;
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
  objectives?: TeamObjectivesDto | null;
  teamId: number;
  win: boolean;
}

export interface TeamObjectivesDto {
  [type: string]: TeamObjectiveDto | undefined;
  atakhan?: TeamObjectiveDto;
  horde?: TeamObjectiveDto;
  baron?: TeamObjectiveDto;
  champion?: TeamObjectiveDto;
  dragon?: TeamObjectiveDto;
  inhibitor?: TeamObjectiveDto;
  riftHerald?: TeamObjectiveDto;
  tower?: TeamObjectiveDto;
}

export interface TeamObjectiveDto {
  first?: boolean | null;
  kills?: number | null;
  lost?: boolean | null;
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
