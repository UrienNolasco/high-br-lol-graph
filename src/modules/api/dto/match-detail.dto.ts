import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO para representar um time na partida
 */
export class MatchTeamDto {
  @ApiProperty({ description: 'ID do time (100=Blue, 200=Red)' })
  teamId: number;

  @ApiProperty({ description: 'Resultado da partida' })
  win: boolean;

  @ApiProperty({
    description: 'Lista de campeões banidos',
    type: [Number],
  })
  bans: number[];

  @ApiProperty({
    description: 'Timeline de objetivos',
    example: { baron: {}, dragon: {}, tower: {} },
  })
  objectivesTimeline: Record<string, any>;
}

/**
 * DTO para representar detalhes de um participante na partida
 * Versão COMPLETA com todos os dados de timeline
 */
export class ParticipantDetailDto {
  @ApiProperty({ description: 'PUUID do jogador' })
  puuid: string;

  @ApiProperty({ description: 'Nome de invocador' })
  summonerName: string;

  @ApiProperty({ description: 'ID do campeão' })
  championId: number;

  @ApiProperty({ description: 'Nome do campeão' })
  championName: string;

  @ApiProperty({ description: 'ID do time' })
  teamId: number;

  @ApiProperty({ description: 'Função (SUPPORT, ADC, MID, etc.)' })
  role: string;

  @ApiProperty({ description: 'Rota (TOP, JUNGLE, MIDDLE, BOTTOM)' })
  lane: string;

  @ApiProperty({ description: 'Resultado' })
  win: boolean;

  @ApiProperty({ description: 'Abates' })
  kills: number;

  @ApiProperty({ description: 'Mortes' })
  deaths: number;

  @ApiProperty({ description: 'Assistências' })
  assists: number;

  @ApiProperty({ description: 'KDA' })
  kda: number;

  @ApiProperty({ description: 'Ouro ganho' })
  goldEarned: number;

  @ApiProperty({ description: 'Dano total' })
  totalDamage: number;

  @ApiProperty({ description: 'Pontos de visão' })
  visionScore: number;

  // Séries temporais (Timeline V5)
  @ApiProperty({
    description: 'Gráfico de ouro (índice = minuto)',
    type: [Number],
  })
  goldGraph: number[];

  @ApiProperty({
    description: 'Gráfico de experiência (índice = minuto)',
    type: [Number],
  })
  xpGraph: number[];

  @ApiProperty({
    description: 'Gráfico de CS (índice = minuto)',
    type: [Number],
  })
  csGraph: number[];

  @ApiProperty({
    description: 'Gráfico de dano (índice = minuto)',
    type: [Number],
  })
  damageGraph: number[];

  // Heatmaps e posicionamento
  @ApiProperty({
    description: 'Posições das mortes',
    example: [{ x: 5000, y: 5000, timestamp: 120000 }],
  })
  deathPositions: Record<string, any>;

  @ApiProperty({
    description: 'Posições dos kills',
    example: [{ x: 7000, y: 3000, timestamp: 240000 }],
  })
  killPositions: Record<string, any>;

  @ApiProperty({
    description: 'Posições das wards',
    example: [{ x: 2000, y: 8000, timestamp: 180000 }],
  })
  wardPositions: Record<string, any>;

  @ApiProperty({
    description: 'Amostra de pathing (posição a cada minuto)',
    example: [{ x: 6000, y: 6000, time: 60000 }],
  })
  pathingSample: Record<string, any>;

  // Comportamento detalhado
  @ApiProperty({
    description: 'Ordem de skills (Q, W, E, R)',
    type: [String],
    example: ['Q', 'W', 'Q', 'E', 'Q', 'R'],
  })
  skillOrder: string[];

  @ApiProperty({
    description: 'Timeline de itens',
    example: [{ itemId: 1055, timestamp: 90000, type: 'BUY' }],
  })
  itemTimeline: Record<string, any>;

  // Dados brutos (JSONB)
  @ApiProperty({ description: 'Runas' })
  runes: Record<string, any>;

  @ApiProperty({ description: 'Desafios (challenges)' })
  challenges: Record<string, any>;

  @ApiProperty({ description: 'Pings' })
  pings: Record<string, any>;

  @ApiProperty({
    description: 'Spells (summoner1Id, summoner2Id)',
    type: [Number],
  })
  spells: number[];
}

/**
 * DTO para representar detalhes completos de uma partida
 */
export class MatchDetailDto {
  @ApiProperty({ description: 'ID da partida' })
  matchId: string;

  @ApiProperty({
    description: 'Timestamp de criação (BigInt convertido para String)',
  })
  gameCreation: string;

  @ApiProperty({ description: 'Duração em segundos' })
  gameDuration: number;

  @ApiProperty({ description: 'Modo de jogo (CLASSIC, ARAM, etc.)' })
  gameMode: string;

  @ApiProperty({ description: 'ID da fila' })
  queueId: number;

  @ApiProperty({ description: 'Versão do jogo' })
  gameVersion: string;

  @ApiProperty({ description: 'ID do mapa' })
  mapId: number;

  @ApiProperty({ description: 'Tem timeline disponível?' })
  hasTimeline: boolean;

  @ApiProperty({
    description: 'Times da partida',
    type: [MatchTeamDto],
  })
  teams: MatchTeamDto[];

  @ApiProperty({
    description: 'Participantes',
    type: [ParticipantDetailDto],
  })
  participants: ParticipantDetailDto[];
}
