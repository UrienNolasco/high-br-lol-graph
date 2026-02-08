# Feature 04: Match Deep Dive

## Visão Geral

Análise profunda de partida individual: timeline de ouro, heatmap de eventos, evolução de builds e radar chart comparativo. Dados calculados **em tempo real** (não pré-calculados).

---

## Endpoints

### 1. GET /api/v1/matches/:matchId

**Descrição:** Visão geral completa da partida (scoreboard). **Já implementado**, usar como base.

**Response:** JSON completo com 10 participantes, teams, e opcionalmente timeline graphs.

---

### 2. GET /api/v1/matches/:matchId/timeline/gold

**Descrição:** Gráfico de diferença de ouro entre times ao longo da partida.

**Response:**
```json
{
  "matchId": "BR1_3216549870",
  "goldDifference": [
    { "minute": 0, "blueTeam": 0, "redTeam": 0, "difference": 0 },
    { "minute": 1, "blueTeam": 3500, "redTeam": 3450, "difference": 50 },
    { "minute": 5, "blueTeam": 15200, "redTeam": 14800, "difference": 400 },
    { "minute": 10, "blueTeam": 28500, "redTeam": 27200, "difference": 1300 },
    { "minute": 15, "blueTeam": 45000, "redTeam": 42000, "difference": 3000 },
    { "minute": 20, "blueTeam": 62000, "redTeam": 65000, "difference": -3000 },
    { "minute": 30, "blueTeam": 85000, "redTeam": 95000, "difference": -10000 }
  ],
  "winner": "redTeam",
  "maxAdvantage": {
    "minute": 15,
    "team": "blueTeam",
    "difference": 3000
  },
  "throwPoint": {
    "minute": 18,
    "beforeDifference": 2500,
    "afterDifference": -1500,
    "swing": 4000
  }
}
```

**Lógica de Cálculo:**
```typescript
async getMatchGoldTimeline(matchId: string): Promise<MatchGoldTimelineDto> {
  // 1. Buscar todos participantes da partida
  const participants = await this.prisma.matchParticipant.findMany({
    where: { matchId },
    select: { puuid, teamId, goldGraph }
  });

  // 2. Determinar duração (maior goldGraph length)
  const maxMinutes = Math.max(...participants.map(p => p.goldGraph.length));

  // 3. Calcular gold por time em cada minuto
  const goldDifference = [];
  for (let minute = 0; minute < maxMinutes; minute++) {
    const blueTeam = participants
      .filter(p => p.teamId === 100)
      .reduce((sum, p) => sum + (p.goldGraph[minute] || 0), 0);

    const redTeam = participants
      .filter(p => p.teamId === 200)
      .reduce((sum, p) => sum + (p.goldGraph[minute] || 0), 0);

    goldDifference.push({
      minute,
      blueTeam,
      redTeam,
      difference: blueTeam - redTeam
    });
  }

  // 4. Identificar vencedor (último minuto)
  const lastEntry = goldDifference[goldDifference.length - 1];
  const winner = lastEntry.difference > 0 ? 'blueTeam' : 'redTeam';

  // 5. Encontrar ponto de maior vantagem
  const maxAdvantage = goldDifference.reduce((max, entry) =>
    Math.abs(entry.difference) > Math.abs(max.difference) ? entry : max
  );

  // 6. Detectar "throw point" (maior swing negativo)
  let throwPoint = null;
  for (let i = 1; i < goldDifference.length; i++) {
    const swing = Math.abs(goldDifference[i].difference - goldDifference[i-1].difference);
    if (swing > 3000 && !throwPoint) {  // Threshold de 3k gold swing
      throwPoint = {
        minute: i,
        beforeDifference: goldDifference[i-1].difference,
        afterDifference: goldDifference[i].difference,
        swing
      };
    }
  }

  return {
    matchId,
    goldDifference,
    winner,
    maxAdvantage: {
      minute: maxAdvantage.minute,
      team: maxAdvantage.difference > 0 ? 'blueTeam' : 'redTeam',
      difference: Math.abs(maxAdvantage.difference)
    },
    throwPoint
  };
}
```

---

### 3. GET /api/v1/matches/:matchId/timeline/events

**Descrição:** Heatmap de eventos importantes (kills, deaths, wards, objetivos).

**Response:**
```json
{
  "matchId": "BR1_3216549870",
  "events": {
    "kills": [
      {
        "puuid": "abc123",
        "championId": 157,
        "x": 5432,
        "y": 8765,
        "timestamp": 120000,
        "minute": 2
      }
    ],
    "deaths": [
      {
        "puuid": "xyz789",
        "championId": 238,
        "x": 5450,
        "y": 8780,
        "timestamp": 120000,
        "minute": 2
      }
    ],
    "wards": [
      {
        "puuid": "abc123",
        "wardType": "CONTROL_WARD",
        "x": 6000,
        "y": 9000,
        "timestamp": 60000,
        "minute": 1
      }
    ],
    "objectives": [
      {
        "type": "DRAGON",
        "subType": "FIRE_DRAGON",
        "teamId": 100,
        "timestamp": 900000,
        "minute": 15,
        "killerId": 1
      },
      {
        "type": "BARON_NASHOR",
        "teamId": 200,
        "timestamp": 1800000,
        "minute": 30,
        "killerId": 6
      },
      {
        "type": "TOWER",
        "subType": "MID_LANE",
        "teamId": 100,
        "timestamp": 600000,
        "minute": 10
      }
    ]
  }
}
```

**Implementação:**
```typescript
async getMatchTimelineEvents(matchId: string): Promise<MatchTimelineEventsDto> {
  // 1. Buscar participantes (kill/death/ward positions)
  const participants = await this.prisma.matchParticipant.findMany({
    where: { matchId },
    select: {
      puuid,
      championId,
      killPositions,
      deathPositions,
      wardPositions
    }
  });

  // 2. Buscar team objectives
  const teams = await this.prisma.matchTeam.findMany({
    where: { matchId },
    select: { objectivesTimeline }
  });

  // 3. Processar kill positions
  const kills = participants.flatMap(p =>
    (p.killPositions as any[]).map(pos => ({
      puuid: p.puuid,
      championId: p.championId,
      x: pos.x,
      y: pos.y,
      timestamp: pos.timestamp,
      minute: Math.floor(pos.timestamp / 60000)
    }))
  );

  // 4. Processar death positions
  const deaths = participants.flatMap(p =>
    (p.deathPositions as any[]).map(pos => ({
      puuid: p.puuid,
      championId: p.championId,
      x: pos.x,
      y: pos.y,
      timestamp: pos.timestamp,
      minute: Math.floor(pos.timestamp / 60000)
    }))
  );

  // 5. Processar ward positions
  const wards = participants.flatMap(p =>
    (p.wardPositions as any[]).map(pos => ({
      puuid: p.puuid,
      wardType: pos.wardType,
      x: pos.x,
      y: pos.y,
      timestamp: pos.timestamp,
      minute: Math.floor(pos.timestamp / 60000)
    }))
  );

  // 6. Processar objectives (flatten de todos os times)
  const objectives = teams.flatMap(team =>
    (team.objectivesTimeline as any[]).map(obj => ({
      type: obj.type,
      subType: obj.subType,
      teamId: obj.teamId,
      timestamp: obj.timestamp,
      minute: Math.floor(obj.timestamp / 60000),
      killerId: obj.killerId
    }))
  );

  return {
    matchId,
    events: {
      kills,
      deaths,
      wards,
      objectives
    }
  };
}
```

---

### 4. GET /api/v1/matches/:matchId/builds

**Descrição:** Evolução de builds de todos os participantes.

**Response:**
```json
{
  "matchId": "BR1_3216549870",
  "builds": [
    {
      "puuid": "abc123",
      "championId": 157,
      "championName": "Yasuo",
      "itemTimeline": [
        { "itemId": 1036, "itemName": "Long Sword", "timestamp": 90000, "minute": 1.5, "type": "BUY" },
        { "itemId": 3006, "itemName": "Berserker's Greaves", "timestamp": 720000, "minute": 12, "type": "BUY" },
        { "itemId": 1036, "itemName": "Long Sword", "timestamp": 750000, "minute": 12.5, "type": "SELL" },
        { "itemId": 3031, "itemName": "Infinity Edge", "timestamp": 1080000, "minute": 18, "type": "BUY" }
      ],
      "finalBuild": [
        { "itemId": 3006, "itemName": "Berserker's Greaves" },
        { "itemId": 3031, "itemName": "Infinity Edge" },
        { "itemId": 3087, "itemName": "Statikk Shiv" },
        { "itemId": 3036, "itemName": "Lord Dominik's Regards" },
        { "itemId": 3046, "itemName": "Phantom Dancer" },
        { "itemId": 3143, "itemName": "Randuin's Omen" }
      ]
    }
  ]
}
```

**Implementação:**
```typescript
async getMatchBuilds(matchId: string): Promise<MatchBuildsDto> {
  const participants = await this.prisma.matchParticipant.findMany({
    where: { matchId },
    select: {
      puuid,
      championId,
      championName,
      itemTimeline
    }
  });

  const builds = await Promise.all(
    participants.map(async (p) => {
      const itemTimeline = (p.itemTimeline as any[]).map(item => ({
        ...item,
        itemName: await this.dataDragonService.getItemNameById(item.itemId),
        minute: item.timestamp / 60000
      }));

      // Calcular build final (último BUY de cada slot, excluindo SELL/UNDO)
      const buyEvents = itemTimeline.filter(e => e.type === 'BUY');
      const finalBuildIds = [...new Set(buyEvents.map(e => e.itemId))].slice(-6);
      const finalBuild = await Promise.all(
        finalBuildIds.map(async (itemId) => ({
          itemId,
          itemName: await this.dataDragonService.getItemNameById(itemId)
        }))
      );

      return {
        puuid: p.puuid,
        championId: p.championId,
        championName: p.championName,
        itemTimeline,
        finalBuild
      };
    })
  );

  return { matchId, builds };
}
```

---

### 5. GET /api/v1/matches/:matchId/performance/:puuid

**Descrição:** Radar chart comparativo (jogador vs oponente de lane).

**Response:**
```json
{
  "matchId": "BR1_3216549870",
  "puuid": "abc123",
  "player": {
    "championId": 157,
    "championName": "Yasuo",
    "role": "MID",
    "dpm": 720.5,
    "gpm": 450.2,
    "cspm": 8.1,
    "visionScorePerMin": 0.83,
    "damageTakenPerMin": 615.2,
    "kda": 6.0
  },
  "opponent": {
    "puuid": "xyz789",
    "championId": 238,
    "championName": "Zed",
    "role": "MID",
    "dpm": 650.3,
    "gpm": 420.8,
    "cspm": 7.5,
    "visionScorePerMin": 0.67,
    "damageTakenPerMin": 665.0,
    "kda": 3.5
  },
  "comparison": {
    "dpmAdvantage": 70.2,
    "dpmAdvantagePercent": 10.8,
    "gpmAdvantage": 29.4,
    "gpmAdvantagePercent": 7.0,
    "cspmAdvantage": 0.6,
    "cspmAdvantagePercent": 8.0,
    "visionAdvantage": 0.16,
    "survivability": -49.8
  }
}
```

**Lógica de Identificação de Oponente:**
```typescript
function findLaneOpponent(
  participants: MatchParticipant[],
  player: MatchParticipant
): MatchParticipant | null {
  return participants.find(
    p => p.role === player.role && p.teamId !== player.teamId
  ) || null;
}
```

**Implementação:**
```typescript
async getMatchPerformanceComparison(
  matchId: string,
  puuid: string
): Promise<MatchPerformanceComparisonDto> {
  // 1. Buscar todos participantes
  const participants = await this.prisma.matchParticipant.findMany({
    where: { matchId },
    include: { match: { select: { gameDuration: true } } }
  });

  // 2. Encontrar jogador
  const player = participants.find(p => p.puuid === puuid);
  if (!player) {
    throw new NotFoundException(`Player ${puuid} not found in match ${matchId}`);
  }

  // 3. Encontrar oponente (mesmo role, teamId oposto)
  const opponent = participants.find(
    p => p.role === player.role && p.teamId !== player.teamId
  );

  const gameDurationMinutes = player.match.gameDuration / 60;

  // 4. Calcular métricas do jogador
  const playerMetrics = {
    championId: player.championId,
    championName: player.championName,
    role: player.role,
    dpm: player.totalDamage / gameDurationMinutes,
    gpm: player.goldEarned / gameDurationMinutes,
    cspm: player.csGraph[player.csGraph.length - 1] / gameDurationMinutes,
    visionScorePerMin: player.visionScore / gameDurationMinutes,
    damageTakenPerMin: 0, // TODO: adicionar damageTaken no schema
    kda: player.kda
  };

  // 5. Calcular métricas do oponente
  const opponentMetrics = opponent ? {
    puuid: opponent.puuid,
    championId: opponent.championId,
    championName: opponent.championName,
    role: opponent.role,
    dpm: opponent.totalDamage / gameDurationMinutes,
    gpm: opponent.goldEarned / gameDurationMinutes,
    cspm: opponent.csGraph[opponent.csGraph.length - 1] / gameDurationMinutes,
    visionScorePerMin: opponent.visionScore / gameDurationMinutes,
    damageTakenPerMin: 0,
    kda: opponent.kda
  } : null;

  // 6. Calcular comparação
  const comparison = opponent ? {
    dpmAdvantage: playerMetrics.dpm - opponentMetrics.dpm,
    dpmAdvantagePercent: ((playerMetrics.dpm - opponentMetrics.dpm) / opponentMetrics.dpm) * 100,
    gpmAdvantage: playerMetrics.gpm - opponentMetrics.gpm,
    gpmAdvantagePercent: ((playerMetrics.gpm - opponentMetrics.gpm) / opponentMetrics.gpm) * 100,
    cspmAdvantage: playerMetrics.cspm - opponentMetrics.cspm,
    cspmAdvantagePercent: ((playerMetrics.cspm - opponentMetrics.cspm) / opponentMetrics.cspm) * 100,
    visionAdvantage: playerMetrics.visionScorePerMin - opponentMetrics.visionScorePerMin,
    survivability: opponentMetrics.damageTakenPerMin - playerMetrics.damageTakenPerMin
  } : null;

  return {
    matchId,
    puuid,
    player: playerMetrics,
    opponent: opponentMetrics,
    comparison
  };
}
```

---

## Fluxo de Dados Geral

```
Match Deep Dive Requests
  ↓
ApiController (routes)
  ↓
ApiService (business logic):
  ├─ /timeline/gold → Agregar goldGraph de participantes por time
  ├─ /timeline/events → Extrair kill/death/ward/objective positions
  ├─ /builds → Processar itemTimeline + enriquecer com nomes
  └─ /performance/:puuid → Calcular métricas e comparar com oponente
  ↓
PrismaService (data access):
  ├─ MatchParticipant (goldGraph, killPositions, itemTimeline)
  └─ MatchTeam (objectivesTimeline)
  ↓
DataDragonService (enrich):
  └─ Buscar nomes de itens/campeões
  ↓
Response: Formatted DTOs
```

---

## Performance Considerations

### 1. Timeline Graphs são pesados
- goldGraph, xpGraph, csGraph: ~40 ints cada (partida de 40min)
- 10 participantes × 4 arrays × 40 valores = 1600 números por partida
- **Solução:** Não incluir no GET /matches/:matchId padrão, apenas nos endpoints específicos

### 2. Cache de Endpoints
- Timeline de partida **nunca muda**
- Cache Redis com TTL infinito (ou 30 dias)
- Key: `match:${matchId}:timeline:gold`

### 3. Positions JSON parsing
- killPositions, deathPositions: arrays de objetos
- **Solução:** Usar Prisma JsonValue, evitar JSON.parse manual

---

## Testes

```bash
# 1. Timeline de ouro
curl http://localhost:3000/api/v1/matches/BR1_3216549870/timeline/gold

# 2. Eventos (heatmap)
curl http://localhost:3000/api/v1/matches/BR1_3216549870/timeline/events

# 3. Builds
curl http://localhost:3000/api/v1/matches/BR1_3216549870/builds

# 4. Performance comparison
curl http://localhost:3000/api/v1/matches/BR1_3216549870/performance/abc123
```

### Verificação SQL

```sql
-- Ver goldGraph de uma partida
SELECT puuid, "teamId", "goldGraph"
FROM match_participants
WHERE "matchId" = 'BR1_3216549870';

-- Ver positions
SELECT puuid, "killPositions", "deathPositions"
FROM match_participants
WHERE "matchId" = 'BR1_3216549870'
LIMIT 1;

-- Ver objectives timeline
SELECT "objectivesTimeline"
FROM match_teams
WHERE "matchId" = 'BR1_3216549870';
```

---

## Observações

1. **Dados Formatados:** Usuario pediu dados formatados (arrays de objetos), então usar `{ minute, value }` ao invés de arrays simples onde necessário
2. **Ward Positions:** Atualmente salvam (0,0) pois WardPlacedEvent não tem posição na API. Considerar melhorar usando participantFrame position
3. **Throw Point Detection:** Algoritmo simples de swing > 3k gold. Pode ser refinado com ML
4. **Item Names:** Requer DataDragon integration. Cachear mapeamento itemId → name
5. **Radar Chart:** Frontend renderiza com bibliotecas como Chart.js ou Recharts
