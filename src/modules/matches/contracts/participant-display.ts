export function optionalText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

export function participantDisplayName(participant: {
  puuid: string;
  summonerName?: string | null;
  riotIdGameName?: string | null;
  riotIdTagline?: string | null;
}) {
  const gameName = optionalText(participant.riotIdGameName);
  const tag = optionalText(participant.riotIdTagline);
  const legacyName = optionalText(participant.summonerName);
  return {
    displayName: gameName
      ? `${gameName}${tag ? `#${tag}` : ''}`
      : (legacyName ?? participant.puuid),
    displayNameSource: gameName
      ? 'riot_id'
      : legacyName
        ? 'summoner_name'
        : 'puuid',
  };
}
