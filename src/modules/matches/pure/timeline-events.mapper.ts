export interface KillPositionJson {
  x: number;
  y: number;
  timestamp: number;
}

export interface WardPositionJson {
  wardType: string;
  x: number;
  y: number;
  timestamp: number;
}

export interface ObjectiveJson {
  type: string;
  subType: string;
  teamId: number;
  timestamp: number;
  killerId: number;
}

export interface KillEvent {
  puuid: string;
  championId: number;
  x: number;
  y: number;
  timestamp: number;
  minute: number;
}

export interface DeathEvent {
  puuid: string;
  championId: number;
  x: number;
  y: number;
  timestamp: number;
  minute: number;
}

export interface WardEvent {
  puuid: string;
  wardType: string;
  x: number;
  y: number;
  timestamp: number;
  minute: number;
}

export interface ObjectiveEvent {
  type: string;
  subType: string;
  teamId: number;
  timestamp: number;
  minute: number;
  killerId: number;
}

export interface EventParticipant {
  puuid: string;
  championId: number;
  killPositions: KillPositionJson[] | null;
  deathPositions: KillPositionJson[] | null;
  wardPositions: WardPositionJson[] | null;
}

export interface EventTeam {
  teamId: number;
  objectivesTimeline: ObjectiveJson[] | null;
}

function toMinute(timestamp: number): number {
  return Math.floor(timestamp / 60000);
}

export function flattenKills(participants: EventParticipant[]): KillEvent[] {
  return participants.flatMap((p) =>
    (p.killPositions || []).map((pos) => ({
      puuid: p.puuid,
      championId: p.championId,
      x: pos.x,
      y: pos.y,
      timestamp: pos.timestamp,
      minute: toMinute(pos.timestamp),
    })),
  );
}

export function flattenDeaths(participants: EventParticipant[]): DeathEvent[] {
  return participants.flatMap((p) =>
    (p.deathPositions || []).map((pos) => ({
      puuid: p.puuid,
      championId: p.championId,
      x: pos.x,
      y: pos.y,
      timestamp: pos.timestamp,
      minute: toMinute(pos.timestamp),
    })),
  );
}

export function flattenWards(participants: EventParticipant[]): WardEvent[] {
  return participants.flatMap((p) =>
    (p.wardPositions || []).map((pos) => ({
      puuid: p.puuid,
      wardType: pos.wardType,
      x: pos.x,
      y: pos.y,
      timestamp: pos.timestamp,
      minute: toMinute(pos.timestamp),
    })),
  );
}

export function flattenObjectives(teams: EventTeam[]): ObjectiveEvent[] {
  return teams.flatMap((team) =>
    (team.objectivesTimeline || []).map((obj) => ({
      type: obj.type,
      subType: obj.subType,
      teamId: obj.teamId ?? team.teamId,
      timestamp: obj.timestamp,
      minute: toMinute(obj.timestamp),
      killerId: obj.killerId,
    })),
  );
}
