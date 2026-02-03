/**
 * DTOs para Timeline V5 da Riot API
 * Documentação: https://developer.riotgames.com/apis#match-v5/GET_getTimeline
 */

// ============================================================================
// ESTRUTURA PRINCIPAL
// ============================================================================

export interface TimelineDto {
  metadata: TimelineMetadata;
  info: TimelineInfo;
}

export interface TimelineMetadata {
  matchId: string;
  participants: string[]; // PUUIDs na ordem (índice + 1 = ParticipantID)
}

export interface TimelineInfo {
  frameInterval: number; // Geralmente 60000ms (1 minuto)
  frames: TimelineFrame[];
  gameId: number;
}

// ============================================================================
// FRAME (snapshot minuto a minuto)
// ============================================================================

export interface TimelineFrame {
  timestamp: number;
  participantFrames: Record<number, ParticipantFrame>;
  events: TimelineEvent[];
}

export interface ParticipantFrame {
  participantId: number;
  position?: Position;
  currentGold: number;
  totalGold: number;
  teamGold: number;
  level: number;
  xp: number;
  minionsKilled: number;
  jungleMinionsKilled: number;
  damageStats: DamageStats;
  goldPerSecond: number;
  trackedGold?: number;
  teamScore?: number;
  dominionScore?: number;
  championStats: ChampionStats;
}

export interface Position {
  x: number;
  y: number;
}

export interface ChampionStats {
  abilityHaste: number;
  abilityPower: number;
  armor: number;
  armorPen: number;
  armorPenPercent: number;
  attackDamage: number;
  attackSpeed: number;
  bonusArmorPenPercent: number;
  bonusMagicPenPercent: number;
  ccReduction: number;
  cooldownReduction: number;
  health: number;
  healthMax: number;
  healthRegen: number;
  lifesteal: number;
  magicPen: number;
  magicPenPercent: number;
  magicResist: number;
  movementSpeed: number;
  omnivamp: number;
  physicalVamp: number;
  power: number;
  powerMax: number;
  powerRegen: number;
  spellVamp: number;
}

export interface DamageStats {
  magicDamageDone: number;
  magicDamageDoneToChampions: number;
  magicDamageTaken: number;
  physicalDamageDone: number;
  physicalDamageDoneToChampions: number;
  physicalDamageTaken: number;
  totalDamageDone: number;
  totalDamageDoneToChampions: number;
  totalDamageTaken: number;
  trueDamageDone: number;
  trueDamageDoneToChampions: number;
  trueDamageTaken: number;
}

// ============================================================================
// EVENTOS (18 tipos)
// ============================================================================

export type TimelineEvent =
  | WardPlacedEvent
  | WardKillEvent
  | ChampionKillEvent
  | ChampionSpecialKillEvent
  | BuildingKillEvent
  | TurretPlateDestroyedEvent
  | ItemPurchasedEvent
  | ItemSoldEvent
  | ItemDestroyedEvent
  | ItemUndoEvent
  | SkillLevelUpEvent
  | LevelUpEvent
  | EliteMonsterKillEvent
  | DragonSoulGivenEvent
  | GameEndEvent
  | PauseEndEvent
  | ObjectiveBountyPrestartEvent
  | ObjectiveBountyFinishEvent;

// Base event
interface BaseEvent {
  type: string;
  timestamp: number;
  realTimestamp?: number;
}

// WARD_PLACED
export interface WardPlacedEvent extends BaseEvent {
  type: 'WARD_PLACED';
  creatorId: number;
  wardType: 'YELLOW_TRINKET' | 'BLUE_TRINKET' | 'CONTROL_WARD' | 'SIGHT_WARD' | 'TEEMO_MUSHROOM' | 'UNDEFINED';
}

// WARD_KILL
export interface WardKillEvent extends BaseEvent {
  type: 'WARD_KILL';
  killerId: number;
  wardType: 'YELLOW_TRINKET' | 'BLUE_TRINKET' | 'CONTROL_WARD' | 'SIGHT_WARD' | 'TEEMO_MUSHROOM' | 'UNDEFINED';
}

// CHAMPION_KILL
export interface ChampionKillEvent extends BaseEvent {
  type: 'CHAMPION_KILL';
  killerId: number;
  victimId: number;
  assistingParticipantIds: number[];
  position: Position;
  bounty: number;
  killStreakLength: number;
  shutdownBounty?: number;
  victimDamageDealt: VictimDamage[];
  victimDamageReceived: VictimDamageReceived[];
}

export interface VictimDamage {
  participantId: number;
  physicalDamage: number;
  magicalDamage: number;
  trueDamage: number;
}

export interface VictimDamageReceived {
  participantId: number;
  totalDamage: number;
  physicalDamage: number;
  magicalDamage: number;
  trueDamage: number;
}

// CHAMPION_SPECIAL_KILL
export interface ChampionSpecialKillEvent extends BaseEvent {
  type: 'CHAMPION_SPECIAL_KILL';
  killerId: number;
  position?: Position;
  killType: 'KILL_FIRST_BLOOD' | 'KILL_ACES_ACE' | 'KILL_SOLO' | 'KILL_TEAM';
  multiKillLength: number;
}

// BUILDING_KILL
export interface BuildingKillEvent extends BaseEvent {
  type: 'BUILDING_KILL';
  killerId: number;
  assistingParticipantIds: number[];
  buildingType: 'TOWER_BUILDING' | 'INHIBITOR_BUILDING';
  towerType: 'OUTER_TURRET' | 'INNER_TURRET' | 'BASE_TURRET' | 'NEXUS_TURRET' | 'UNDEFINED';
  laneType: 'TOP_LANE' | 'MID_LANE' | 'BOT_LANE' | 'UNDEFINED';
  teamId: number;
  position: Position;
  bounty: number;
}

// TURRET_PLATE_DESTROYED
export interface TurretPlateDestroyedEvent extends BaseEvent {
  type: 'TURRET_PLATE_DESTROYED';
  killerId: number;
  laneType: 'TOP_LANE' | 'MID_LANE' | 'BOT_LANE' | 'UNDEFINED';
  teamId: number;
  position: Position;
}

// ITEM_PURCHASED
export interface ItemPurchasedEvent extends BaseEvent {
  type: 'ITEM_PURCHASED';
  itemId: number;
  participantId: number;
}

// ITEM_SOLD
export interface ItemSoldEvent extends BaseEvent {
  type: 'ITEM_SOLD';
  itemId: number;
  participantId: number;
}

// ITEM_DESTROYED
export interface ItemDestroyedEvent extends BaseEvent {
  type: 'ITEM_DESTROYED';
  itemId: number;
  participantId: number;
}

// ITEM_UNDO (compra desfeita na base)
export interface ItemUndoEvent extends BaseEvent {
  type: 'ITEM_UNDO';
  beforeId: number;
  afterId: number;
  goldGain: number;
  participantId: number;
}

// SKILL_LEVEL_UP
export interface SkillLevelUpEvent extends BaseEvent {
  type: 'SKILL_LEVEL_UP';
  levelUpType: 'NORMAL' | 'EVOLVED';
  participantId: number;
  skillSlot: number; // 1=Q, 2=W, 3=E, 4=R
}

// LEVEL_UP
export interface LevelUpEvent extends BaseEvent {
  type: 'LEVEL_UP';
  level: number;
  participantId: number;
}

// ELITE_MONSTER_KILL
export interface EliteMonsterKillEvent extends BaseEvent {
  type: 'ELITE_MONSTER_KILL';
  killerId: number;
  assistingParticipantIds: number[];
  bounty: number;
  killerTeamId: number;
  monsterType: 'DRAGON' | 'BARON_NASHOR' | 'RIFTHERALD' | 'HORDE';
  monsterSubType: 'EARTH' | 'WATER' | 'FIRE' | 'AIR' | 'HEXTECH' | 'CHESS' | 'CHESS_MINION' | 'RUINED_KING' | 'ELDER_DRAGON' | '' | 'ORDNANCE';
  position: Position;
}

// DRAGON_SOUL_GIVEN
export interface DragonSoulGivenEvent extends BaseEvent {
  type: 'DRAGON_SOUL_GIVEN';
  name: 'EARTH' | 'WATER' | 'FIRE' | 'AIR' | 'HEXTECH' | 'CHESS' | 'RUINED_KING';
  teamId: number;
}

// GAME_END
export interface GameEndEvent extends BaseEvent {
  type: 'GAME_END';
  gameId: number;
  winningTeam: number;
}

// PAUSE_END
export interface PauseEndEvent extends BaseEvent {
  type: 'PAUSE_END';
  realTimestamp: number;
}

// OBJECTIVE_BOUNTY_PRESTART
export interface ObjectiveBountyPrestartEvent extends BaseEvent {
  type: 'OBJECTIVE_BOUNTY_PRESTART';
  teamId: number;
  actualStartTime: number;
}

// OBJECTIVE_BOUNTY_FINISH
export interface ObjectiveBountyFinishEvent extends BaseEvent {
  type: 'OBJECTIVE_BOUNTY_FINISH';
  teamId: number;
}

// ============================================================================
// UTILITÁRIOS
// ============================================================================

/**
 * Verifica se um evento é de kill/morte
 */
export function isKillEvent(event: TimelineEvent): event is ChampionKillEvent {
  return event.type === 'CHAMPION_KILL';
}

/**
 * Verifica se um evento é de ward
 */
export function isWardEvent(event: TimelineEvent): event is WardPlacedEvent | WardKillEvent {
  return event.type === 'WARD_PLACED' || event.type === 'WARD_KILL';
}

/**
 * Verifica se um evento é de item
 */
export function isItemEvent(event: TimelineEvent): event is ItemPurchasedEvent | ItemSoldEvent | ItemDestroyedEvent | ItemUndoEvent {
  return ['ITEM_PURCHASED', 'ITEM_SOLD', 'ITEM_DESTROYED', 'ITEM_UNDO'].includes(event.type);
}

/**
 * Verifica se um evento é de objetivo épico
 */
export function isEliteMonsterEvent(event: TimelineEvent): event is EliteMonsterKillEvent {
  return event.type === 'ELITE_MONSTER_KILL';
}

/**
 * Converte skillSlot numérico para letra (1=Q, 2=W, 3=E, 4=R)
 */
export function skillSlotToLetter(slot: number): string {
  const map: Record<number, string> = { 1: 'Q', 2: 'W', 3: 'E', 4: 'R' };
  return map[slot] || '?';
}
