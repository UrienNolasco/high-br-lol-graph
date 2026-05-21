export interface ItemTimelineJson {
  itemId: number;
  timestamp: number;
  type: string;
}

export interface BuildParticipant {
  puuid: string;
  championId: number;
  championName: string;
  itemTimeline: ItemTimelineJson[] | null;
}

export interface ItemEvent {
  itemId: number;
  timestamp: number;
  minute: number;
  type: string;
}

export interface FinalItem {
  itemId: number;
}

export interface ParticipantBuild {
  puuid: string;
  championId: number;
  championName: string;
  itemTimeline: ItemEvent[];
  finalBuild: FinalItem[];
}

export function mapParticipantBuild(p: BuildParticipant): ParticipantBuild {
  const rawTimeline = p.itemTimeline || [];

  const itemTimeline: ItemEvent[] = rawTimeline.map((item) => ({
    itemId: item.itemId,
    timestamp: item.timestamp,
    minute: parseFloat((item.timestamp / 60000).toFixed(1)),
    type: item.type,
  }));

  const buyEvents = itemTimeline.filter((e) => e.type === 'BUY');
  const finalBuildIds = [...new Set(buyEvents.map((e) => e.itemId))].slice(-6);
  const finalBuild = finalBuildIds.map((itemId) => ({ itemId }));

  return {
    puuid: p.puuid,
    championId: p.championId,
    championName: p.championName,
    itemTimeline,
    finalBuild,
  };
}
