# Feature 01: Macro Analysis do Jogador

## Visão Geral

Endpoints para análise macro do jogador: estatísticas agregadas, performance por campeão, distribuição de roles e mapa de calor de atividade. Foco em **dados pré-calculados** para carregamento instantâneo da UI.

---

## Tabelas Prisma Necessárias

### PlayerStats (Agregação geral do jogador)

```prisma
model PlayerStats {
  id              Int       @id @default(autoincrement())
  puuid           String
  patch           String?   // NULL = lifetime, "15.19" = patch específico
  queueId         Int       @default(420) // Ranked Solo/Duo

  // Contadores
  gamesPlayed     Int       @default(0)
  wins            Int       @default(0)
  losses          Int       @default(0)
  winRate         Float     @default(0)

  // Médias gerais (todas as partidas, todos campeões)
  avgKda          Float     @default(0)
  avgDpm          Float     @default(0)
  avgCspm         Float     @default(0)
  avgGpm          Float     @default(0)
  avgVisionScore  Float     @default(0)

  // Distribuição de roles (JSON)
  // { "TOP": 10, "JUNGLE": 5, "MID": 30, "BOTTOM": 2, "UTILITY": 3 }
  roleDistribution Json     @default("{}")

  // Top 5 campeões mais jogados (JSON)
  // [{ championId: 157, games: 20, winRate: 60 }, ...]
  topChampions    Json      @default("[]")

  // Timestamps
  lastUpdated     DateTime  @default(now())

  @@unique([puuid, patch, queueId])
  @@index([puuid])
  @@index([puuid, patch])
  @@map("player_stats")
}
```

### PlayerChampionStats (Performance por campeão)

```prisma
model PlayerChampionStats {
  id              Int       @id @default(autoincrement())
  puuid           String
  championId      Int
  patch           String?   // NULL = lifetime, "15.19" = patch específico
  queueId         Int       @default(420)

  // Contadores
  gamesPlayed     Int       @default(0)
  wins            Int       @default(0)
  losses          Int       @default(0)
  winRate         Float     @default(0)

  // Médias específicas do campeão
  avgKda          Float     @default(0)
  avgDpm          Float     @default(0)
  avgCspm         Float     @default(0)
  avgGpm          Float     @default(0)
  avgVisionScore  Float     @default(0)

  // Laning phase metrics (média @15min)
  avgCsd15        Float     @default(0) // CS difference @ 15
  avgGd15         Float     @default(0) // Gold difference @ 15
  avgXpd15        Float     @default(0) // XP difference @ 15

  // Distribuição de roles
  // { "TOP": 8, "MID": 2 }
  roleDistribution Json     @default("{}")

  // Última vez jogado
  lastPlayedAt    DateTime?

  @@unique([puuid, championId, patch, queueId])
  @@index([puuid])
  @@index([puuid, lastPlayedAt])
  @@index([championId])
  @@map("player_champion_stats")
}
```

---

## Endpoints

### 1. GET /api/v1/players/:puuid/summary

**Descrição:** Cartão de visitas do jogador - estatísticas gerais agregadas.

**Query Params:**
- `patch` (optional): "15.19" | "lifetime" (default: "lifetime")
- `championId` (optional): Filtrar por campeão específico
- `role` (optional): Filtrar por role (TOP, JUNGLE, MID, BOTTOM, UTILITY)

**Response:**
```json
{
  "puuid": "abc123def456",
  "patch": "lifetime",
  "queueId": 420,
  "gamesPlayed": 150,
  "wins": 90,
  "losses": 60,
  "winRate": 60.0,
  "avgKda": 3.45,
  "avgCspm": 7.2,
  "avgDpm": 650.5,
  "avgGpm": 420.3,
  "avgVisionScore": 35.8,
  "roleDistribution": {
    "MID": 80,
    "TOP": 40,
    "JUNGLE": 30
  },
  "topChampions": [
    {
      "championId": 157,
      "championName": "Yasuo",
      "games": 50,
      "winRate": 62.0
    },
    {
      "championId": 11,
      "championName": "Master Yi",
      "games": 30,
      "winRate": 55.0
    }
  ],
  "lastUpdated": "2026-02-05T10:30:00.000Z"
}
```

**Fluxo de Dados:**
```
Request: GET /api/v1/players/abc123/summary?patch=lifetime
  ↓
ApiController.getPlayerSummary(puuid, query)
  ↓
ApiService.getPlayerSummary(puuid, filters):
  ├─ 1. Buscar PlayerStats (puuid, patch=NULL, queueId=420)
  ├─ 2. Se não existir → retornar 404
  └─ 3. Enriquecer topChampions com nomes via DataDragonService
  ↓
Response: PlayerSummaryDto
```

**SQL Query:**
```sql
SELECT *
FROM player_stats
WHERE puuid = 'abc123'
  AND patch IS NULL  -- lifetime
  AND queueId = 420; -- ranked solo
```

**Implementação (ApiService):**
```typescript
async getPlayerSummary(
  puuid: string,
  filters: { patch?: string; championId?: number; role?: string }
): Promise<PlayerSummaryDto> {
  const patch = filters.patch === 'lifetime' || !filters.patch ? null : filters.patch;

  const playerStats = await this.prisma.playerStats.findUnique({
    where: {
      puuid_patch_queueId: {
        puuid,
        patch,
        queueId: 420
      }
    }
  });

  if (!playerStats) {
    throw new NotFoundException(`No stats found for player ${puuid}`);
  }

  // Enriquecer topChampions com nomes dos campeões
  const topChampions = playerStats.topChampions as Array<{ championId: number; games: number; winRate: number }>;
  const enrichedTopChampions = await Promise.all(
    topChampions.map(async (champ) => {
      const championName = await this.dataDragonService.getChampionNameById(champ.championId);
      return { ...champ, championName };
    })
  );

  return {
    puuid: playerStats.puuid,
    patch: patch || 'lifetime',
    queueId: playerStats.queueId,
    gamesPlayed: playerStats.gamesPlayed,
    wins: playerStats.wins,
    losses: playerStats.losses,
    winRate: playerStats.winRate,
    avgKda: playerStats.avgKda,
    avgCspm: playerStats.avgCspm,
    avgDpm: playerStats.avgDpm,
    avgGpm: playerStats.avgGpm,
    avgVisionScore: playerStats.avgVisionScore,
    roleDistribution: playerStats.roleDistribution,
    topChampions: enrichedTopChampions,
    lastUpdated: playerStats.lastUpdated
  };
}
```

---

### 2. GET /api/v1/players/:puuid/champions

**Descrição:** Lista de performance detalhada por campeão.

**Query Params:**
- `patch` (optional): "15.19" | "lifetime" (default: "lifetime")
- `role` (optional): Filtrar apenas jogos nessa role
- `limit` (default: 10, max: 50): Quantos campeões retornar
- `sortBy` (default: "games"): "games" | "winRate" | "kda"

**Response:**
```json
{
  "puuid": "abc123def456",
  "patch": "lifetime",
  "champions": [
    {
      "championId": 157,
      "championName": "Yasuo",
      "gamesPlayed": 50,
      "wins": 31,
      "losses": 19,
      "winRate": 62.0,
      "avgKda": 4.2,
      "avgCspm": 8.1,
      "avgDpm": 720.5,
      "avgGpm": 450.2,
      "avgVisionScore": 20.5,
      "avgCsd15": 5.3,
      "avgGd15": 320.5,
      "avgXpd15": 150.2,
      "roleDistribution": {
        "MID": 45,
        "TOP": 5
      },
      "lastPlayedAt": "2026-02-04T18:30:00.000Z"
    },
    {
      "championId": 11,
      "championName": "Master Yi",
      "gamesPlayed": 30,
      "wins": 17,
      "losses": 13,
      "winRate": 56.67,
      "avgKda": 5.8,
      "avgCspm": 6.5,
      "avgDpm": 850.2,
      "avgGpm": 480.5,
      "avgVisionScore": 15.2,
      "avgCsd15": 8.5,
      "avgGd15": 450.3,
      "avgXpd15": 200.1,
      "roleDistribution": {
        "JUNGLE": 30
      },
      "lastPlayedAt": "2026-02-03T20:15:00.000Z"
    }
  ]
}
```

**Fluxo de Dados:**
```
Request: GET /api/v1/players/abc123/champions?sortBy=winRate&limit=10
  ↓
ApiController.getPlayerChampions(puuid, query)
  ↓
ApiService.getPlayerChampions(puuid, filters):
  ├─ 1. Query PlayerChampionStats (puuid, patch, queueId)
  ├─ 2. Se role filter: filtrar via JSON roleDistribution
  ├─ 3. Ordenar por sortBy (gamesPlayed DESC | winRate DESC | avgKda DESC)
  ├─ 4. Limit results
  └─ 5. Enriquecer com nomes via DataDragonService
  ↓
Response: PlayerChampionsDto
```

**SQL Query:**
```sql
SELECT *
FROM player_champion_stats
WHERE puuid = 'abc123'
  AND patch IS NULL  -- lifetime
  AND queueId = 420
ORDER BY winRate DESC  -- ou gamesPlayed DESC, avgKda DESC
LIMIT 10;
```

**Filtro por Role (JSON):**
```typescript
// Filtrar campeões que têm jogos na role especificada
const filteredChampions = championStats.filter(champ => {
  const roleDistribution = champ.roleDistribution as Record<string, number>;
  return filters.role ? roleDistribution[filters.role] > 0 : true;
});
```

**Implementação (ApiService):**
```typescript
async getPlayerChampions(
  puuid: string,
  filters: { patch?: string; role?: string; limit?: number; sortBy?: string }
): Promise<PlayerChampionsDto> {
  const patch = filters.patch === 'lifetime' || !filters.patch ? null : filters.patch;
  const limit = Math.min(filters.limit || 10, 50);
  const sortBy = filters.sortBy || 'games';

  // Query campeões do jogador
  let championStats = await this.prisma.playerChampionStats.findMany({
    where: {
      puuid,
      patch,
      queueId: 420
    }
  });

  // Filtrar por role se especificado
  if (filters.role) {
    championStats = championStats.filter(champ => {
      const roleDistribution = champ.roleDistribution as Record<string, number>;
      return roleDistribution[filters.role] > 0;
    });
  }

  // Ordenar
  championStats.sort((a, b) => {
    if (sortBy === 'winRate') return b.winRate - a.winRate;
    if (sortBy === 'kda') return b.avgKda - a.avgKda;
    return b.gamesPlayed - a.gamesPlayed; // default: games
  });

  // Limitar
  championStats = championStats.slice(0, limit);

  // Enriquecer com nomes
  const enrichedChampions = await Promise.all(
    championStats.map(async (champ) => {
      const championName = await this.dataDragonService.getChampionNameById(champ.championId);
      return { ...champ, championName };
    })
  );

  return {
    puuid,
    patch: patch || 'lifetime',
    champions: enrichedChampions
  };
}
```

---

### 3. GET /api/v1/players/:puuid/roles

**Descrição:** Distribuição de roles e winrate por role.

**Query Params:**
- `patch` (optional): "15.19" | "lifetime" (default: "lifetime")

**Response:**
```json
{
  "puuid": "abc123def456",
  "patch": "lifetime",
  "roles": [
    {
      "role": "MID",
      "gamesPlayed": 80,
      "percentage": 53.3,
      "wins": 50,
      "losses": 30,
      "winRate": 62.5,
      "avgKda": 3.8
    },
    {
      "role": "TOP",
      "gamesPlayed": 40,
      "percentage": 26.7,
      "wins": 22,
      "losses": 18,
      "winRate": 55.0,
      "avgKda": 3.1
    },
    {
      "role": "JUNGLE",
      "gamesPlayed": 30,
      "percentage": 20.0,
      "wins": 18,
      "losses": 12,
      "winRate": 60.0,
      "avgKda": 4.5
    }
  ],
  "totalGames": 150
}
```

**Fluxo de Dados:**
```
Request: GET /api/v1/players/abc123/roles?patch=lifetime
  ↓
ApiController.getPlayerRoleDistribution(puuid, query)
  ↓
ApiService.getPlayerRoleDistribution(puuid, filters):
  ├─ 1. Query MatchParticipant (puuid, queueId=420, patch via Match.gameVersion)
  ├─ 2. Agrupar por role: COUNT, SUM(win), AVG(kda)
  ├─ 3. Calcular percentages
  └─ 4. Ordenar por gamesPlayed DESC
  ↓
Response: PlayerRoleDistributionDto
```

**SQL Query (Raw Aggregation):**
```sql
SELECT
  mp.role,
  COUNT(*) as gamesPlayed,
  SUM(CASE WHEN mp.win THEN 1 ELSE 0 END) as wins,
  SUM(CASE WHEN NOT mp.win THEN 1 ELSE 0 END) as losses,
  (SUM(CASE WHEN mp.win THEN 1 ELSE 0 END)::float / COUNT(*)) * 100 as winRate,
  AVG(mp.kda) as avgKda
FROM match_participants mp
JOIN matches m ON mp.matchId = m.matchId
WHERE mp.puuid = 'abc123'
  AND m.queueId = 420
  -- E filtrar por patch se necessário: m.gameVersion LIKE '15.19%'
GROUP BY mp.role
ORDER BY gamesPlayed DESC;
```

**Implementação (ApiService):**
```typescript
async getPlayerRoleDistribution(
  puuid: string,
  filters: { patch?: string }
): Promise<PlayerRoleDistributionDto> {
  const patch = filters.patch;

  // Query com agregação
  const roleStats = await this.prisma.$queryRaw<Array<{
    role: string;
    gamesPlayed: bigint;
    wins: bigint;
    losses: bigint;
    winRate: number;
    avgKda: number;
  }>>`
    SELECT
      mp.role,
      COUNT(*) as gamesPlayed,
      SUM(CASE WHEN mp.win THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN NOT mp.win THEN 1 ELSE 0 END) as losses,
      (SUM(CASE WHEN mp.win THEN 1 ELSE 0 END)::float / COUNT(*)) * 100 as winRate,
      AVG(mp.kda) as avgKda
    FROM match_participants mp
    JOIN matches m ON mp."matchId" = m."matchId"
    WHERE mp.puuid = ${puuid}
      AND m."queueId" = 420
      ${patch && patch !== 'lifetime' ? Prisma.sql`AND m."gameVersion" LIKE ${patch + '%'}` : Prisma.empty}
    GROUP BY mp.role
    ORDER BY gamesPlayed DESC
  `;

  const totalGames = roleStats.reduce((sum, role) => sum + Number(role.gamesPlayed), 0);

  const roles = roleStats.map(role => ({
    role: role.role,
    gamesPlayed: Number(role.gamesPlayed),
    percentage: (Number(role.gamesPlayed) / totalGames) * 100,
    wins: Number(role.wins),
    losses: Number(role.losses),
    winRate: role.winRate,
    avgKda: role.avgKda
  }));

  return {
    puuid,
    patch: patch || 'lifetime',
    roles,
    totalGames
  };
}
```

---

### 4. GET /api/v1/players/:puuid/activity

**Descrição:** Mapa de calor de atividade estilo GitHub Contributions (matriz 7x24).

**Query Params:**
- `patch` (optional): "15.19" | "lifetime" (default: "lifetime")

**Response:**
```json
{
  "puuid": "abc123def456",
  "patch": "lifetime",
  "heatmap": [
    {
      "dayOfWeek": 0,
      "hour": 0,
      "games": 2,
      "wins": 1,
      "losses": 1,
      "winRate": 50.0
    },
    {
      "dayOfWeek": 0,
      "hour": 1,
      "games": 0,
      "wins": 0,
      "losses": 0,
      "winRate": 0
    },
    ...
    // Total: 168 entries (7 dias * 24 horas)
  ],
  "insights": {
    "mostActiveDay": "Saturday",
    "mostActiveDayGames": 35,
    "mostActiveHour": 23,
    "mostActiveHourGames": 15,
    "peakWinRate": 75.0,
    "peakWinRateTime": "Sunday 14h",
    "worstWinRate": 30.0,
    "worstWinRateTime": "Saturday 3h"
  }
}
```

**Fluxo de Dados:**
```
Request: GET /api/v1/players/abc123/activity
  ↓
ApiController.getPlayerActivity(puuid, query)
  ↓
ApiService.getPlayerActivity(puuid, filters):
  ├─ 1. Query MatchParticipant + Match (JOIN para pegar gameCreation)
  ├─ 2. Para cada partida:
  │    ├─ Extrair timestamp (Match.gameCreation)
  │    ├─ Converter para timezone local (America/Sao_Paulo)
  │    ├─ Extrair dayOfWeek (0-6, Domingo=0) e hour (0-23)
  │    └─ Agrupar por [dayOfWeek, hour]
  ├─ 3. Calcular stats por grupo (games, wins, losses, winRate)
  ├─ 4. Preencher matriz completa 7x24 (zeros onde não há jogos)
  └─ 5. Gerar insights (most active, peak winrate, etc)
  ↓
Response: PlayerActivityDto
```

**SQL Query (Agregação com timestamp):**
```sql
SELECT
  EXTRACT(DOW FROM TO_TIMESTAMP(m."gameCreation" / 1000) AT TIME ZONE 'America/Sao_Paulo') as dayOfWeek,
  EXTRACT(HOUR FROM TO_TIMESTAMP(m."gameCreation" / 1000) AT TIME ZONE 'America/Sao_Paulo') as hour,
  COUNT(*) as games,
  SUM(CASE WHEN mp.win THEN 1 ELSE 0 END) as wins,
  SUM(CASE WHEN NOT mp.win THEN 1 ELSE 0 END) as losses,
  (SUM(CASE WHEN mp.win THEN 1 ELSE 0 END)::float / COUNT(*)) * 100 as winRate
FROM match_participants mp
JOIN matches m ON mp."matchId" = m."matchId"
WHERE mp.puuid = 'abc123'
  AND m."queueId" = 420
GROUP BY dayOfWeek, hour
ORDER BY dayOfWeek, hour;
```

**Lógica de Preenchimento (Matriz 7x24):**
```typescript
// Criar matriz vazia 7x24
const heatmap = [];
for (let day = 0; day < 7; day++) {
  for (let hour = 0; hour < 24; hour++) {
    heatmap.push({
      dayOfWeek: day,
      hour,
      games: 0,
      wins: 0,
      losses: 0,
      winRate: 0
    });
  }
}

// Preencher com dados reais
activityData.forEach(entry => {
  const index = entry.dayOfWeek * 24 + entry.hour;
  heatmap[index] = {
    dayOfWeek: entry.dayOfWeek,
    hour: entry.hour,
    games: Number(entry.games),
    wins: Number(entry.wins),
    losses: Number(entry.losses),
    winRate: entry.winRate
  };
});
```

**Implementação (ApiService):**
```typescript
async getPlayerActivity(
  puuid: string,
  filters: { patch?: string }
): Promise<PlayerActivityDto> {
  const patch = filters.patch;

  // Query agregação por dia/hora
  const activityData = await this.prisma.$queryRaw<Array<{
    dayOfWeek: number;
    hour: number;
    games: bigint;
    wins: bigint;
    losses: bigint;
    winRate: number;
  }>>`
    SELECT
      EXTRACT(DOW FROM TO_TIMESTAMP(m."gameCreation" / 1000) AT TIME ZONE 'America/Sao_Paulo') as dayOfWeek,
      EXTRACT(HOUR FROM TO_TIMESTAMP(m."gameCreation" / 1000) AT TIME ZONE 'America/Sao_Paulo') as hour,
      COUNT(*) as games,
      SUM(CASE WHEN mp.win THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN NOT mp.win THEN 1 ELSE 0 END) as losses,
      (SUM(CASE WHEN mp.win THEN 1 ELSE 0 END)::float / COUNT(*)) * 100 as winRate
    FROM match_participants mp
    JOIN matches m ON mp."matchId" = m."matchId"
    WHERE mp.puuid = ${puuid}
      AND m."queueId" = 420
      ${patch && patch !== 'lifetime' ? Prisma.sql`AND m."gameVersion" LIKE ${patch + '%'}` : Prisma.empty}
    GROUP BY dayOfWeek, hour
    ORDER BY dayOfWeek, hour
  `;

  // Criar matriz completa 7x24
  const heatmap = [];
  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      heatmap.push({
        dayOfWeek: day,
        hour,
        games: 0,
        wins: 0,
        losses: 0,
        winRate: 0
      });
    }
  }

  // Preencher com dados reais
  activityData.forEach(entry => {
    const index = entry.dayOfWeek * 24 + entry.hour;
    heatmap[index] = {
      dayOfWeek: entry.dayOfWeek,
      hour: entry.hour,
      games: Number(entry.games),
      wins: Number(entry.wins),
      losses: Number(entry.losses),
      winRate: entry.winRate
    };
  });

  // Gerar insights
  const insights = this.calculateActivityInsights(heatmap);

  return {
    puuid,
    patch: patch || 'lifetime',
    heatmap,
    insights
  };
}

private calculateActivityInsights(heatmap: any[]) {
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // Agregar por dia
  const dayStats = new Array(7).fill(0).map(() => ({ games: 0, wins: 0 }));
  heatmap.forEach(entry => {
    dayStats[entry.dayOfWeek].games += entry.games;
    dayStats[entry.dayOfWeek].wins += entry.wins;
  });
  const mostActiveDayIndex = dayStats.reduce((maxIdx, day, idx, arr) =>
    day.games > arr[maxIdx].games ? idx : maxIdx, 0);

  // Encontrar hora mais ativa
  const mostActiveHourEntry = heatmap.reduce((max, entry) =>
    entry.games > max.games ? entry : max);

  // Encontrar melhor/pior winrate (apenas células com 5+ jogos)
  const qualifiedEntries = heatmap.filter(e => e.games >= 5);
  const peakWinRateEntry = qualifiedEntries.reduce((max, entry) =>
    entry.winRate > max.winRate ? entry : max, qualifiedEntries[0]);
  const worstWinRateEntry = qualifiedEntries.reduce((min, entry) =>
    entry.winRate < min.winRate ? entry : min, qualifiedEntries[0]);

  return {
    mostActiveDay: dayNames[mostActiveDayIndex],
    mostActiveDayGames: dayStats[mostActiveDayIndex].games,
    mostActiveHour: mostActiveHourEntry.hour,
    mostActiveHourGames: mostActiveHourEntry.games,
    peakWinRate: peakWinRateEntry?.winRate || 0,
    peakWinRateTime: `${dayNames[peakWinRateEntry?.dayOfWeek]} ${peakWinRateEntry?.hour}h`,
    worstWinRate: worstWinRateEntry?.winRate || 0,
    worstWinRateTime: `${dayNames[worstWinRateEntry?.dayOfWeek]} ${worstWinRateEntry?.hour}h`
  };
}
```

---

## Como o Worker Atualiza as Agregações

### PlayerStatsAggregationService (NOVO)

Criar serviço em `src/core/stats/player-stats-aggregation.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface ParticipantData {
  puuid: string;
  championId: number;
  championName: string;
  role: string;
  teamId: number;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  kda: number;
  goldEarned: number;
  totalDamage: number;
  visionScore: number;
  goldGraph: number[];
  xpGraph: number[];
  csGraph: number[];
  damageGraph: number[];
}

@Injectable()
export class PlayerStatsAggregationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Atualiza PlayerStats e PlayerChampionStats para um participante
   */
  async updatePlayerAggregates(
    participant: ParticipantData,
    opponent: ParticipantData | null,
    patch: string,
    gameDurationMinutes: number
  ): Promise<void> {
    // Atualizar lifetime stats
    await this.updatePlayerStats(participant, null, gameDurationMinutes);
    await this.updatePlayerChampionStats(participant, opponent, null, gameDurationMinutes);

    // Atualizar patch stats
    await this.updatePlayerStats(participant, patch, gameDurationMinutes);
    await this.updatePlayerChampionStats(participant, opponent, patch, gameDurationMinutes);
  }

  /**
   * Atualiza PlayerStats (agregação geral do jogador)
   */
  private async updatePlayerStats(
    participant: ParticipantData,
    patch: string | null,
    gameDurationMinutes: number
  ): Promise<void> {
    const current = await this.prisma.playerStats.findUnique({
      where: {
        puuid_patch_queueId: {
          puuid: participant.puuid,
          patch,
          queueId: 420
        }
      }
    });

    const gamesPlayed = (current?.gamesPlayed || 0) + 1;
    const wins = (current?.wins || 0) + (participant.win ? 1 : 0);
    const losses = (current?.losses || 0) + (participant.win ? 0 : 1);
    const winRate = (wins / gamesPlayed) * 100;

    // Weighted averages
    const weight = (current?.gamesPlayed || 0) / gamesPlayed;
    const newWeight = 1 / gamesPlayed;

    const avgKda = (current?.avgKda || 0) * weight + participant.kda * newWeight;
    const avgDpm = (current?.avgDpm || 0) * weight + (participant.totalDamage / gameDurationMinutes) * newWeight;
    const avgGpm = (current?.avgGpm || 0) * weight + (participant.goldEarned / gameDurationMinutes) * newWeight;
    const avgCspm = (current?.avgCspm || 0) * weight + (participant.csGraph[participant.csGraph.length - 1] / gameDurationMinutes) * newWeight;
    const avgVisionScore = (current?.avgVisionScore || 0) * weight + participant.visionScore * newWeight;

    // Atualizar distribuição de roles
    const roleDistribution = (current?.roleDistribution as Record<string, number>) || {};
    roleDistribution[participant.role] = (roleDistribution[participant.role] || 0) + 1;

    // Atualizar top champions (top 5 por games)
    let topChampions = (current?.topChampions as Array<{ championId: number; games: number; winRate: number }>) || [];
    const champIndex = topChampions.findIndex(c => c.championId === participant.championId);
    if (champIndex >= 0) {
      topChampions[champIndex].games++;
      topChampions[champIndex].winRate =
        (topChampions[champIndex].winRate * (topChampions[champIndex].games - 1) + (participant.win ? 100 : 0)) / topChampions[champIndex].games;
    } else {
      topChampions.push({
        championId: participant.championId,
        games: 1,
        winRate: participant.win ? 100 : 0
      });
    }
    topChampions.sort((a, b) => b.games - a.games);
    topChampions = topChampions.slice(0, 5);

    await this.prisma.playerStats.upsert({
      where: {
        puuid_patch_queueId: {
          puuid: participant.puuid,
          patch,
          queueId: 420
        }
      },
      create: {
        puuid: participant.puuid,
        patch,
        queueId: 420,
        gamesPlayed: 1,
        wins: participant.win ? 1 : 0,
        losses: participant.win ? 0 : 1,
        winRate: participant.win ? 100 : 0,
        avgKda: participant.kda,
        avgDpm: participant.totalDamage / gameDurationMinutes,
        avgCspm: participant.csGraph[participant.csGraph.length - 1] / gameDurationMinutes,
        avgGpm: participant.goldEarned / gameDurationMinutes,
        avgVisionScore: participant.visionScore,
        roleDistribution: { [participant.role]: 1 },
        topChampions: [{ championId: participant.championId, games: 1, winRate: participant.win ? 100 : 0 }]
      },
      update: {
        gamesPlayed,
        wins,
        losses,
        winRate,
        avgKda,
        avgDpm,
        avgCspm,
        avgGpm,
        avgVisionScore,
        roleDistribution,
        topChampions,
        lastUpdated: new Date()
      }
    });
  }

  /**
   * Atualiza PlayerChampionStats (performance por campeão)
   */
  private async updatePlayerChampionStats(
    participant: ParticipantData,
    opponent: ParticipantData | null,
    patch: string | null,
    gameDurationMinutes: number
  ): Promise<void> {
    const current = await this.prisma.playerChampionStats.findUnique({
      where: {
        puuid_championId_patch_queueId: {
          puuid: participant.puuid,
          championId: participant.championId,
          patch,
          queueId: 420
        }
      }
    });

    const gamesPlayed = (current?.gamesPlayed || 0) + 1;
    const wins = (current?.wins || 0) + (participant.win ? 1 : 0);
    const losses = (current?.losses || 0) + (participant.win ? 0 : 1);
    const winRate = (wins / gamesPlayed) * 100;

    // Weighted averages
    const weight = (current?.gamesPlayed || 0) / gamesPlayed;
    const newWeight = 1 / gamesPlayed;

    const avgKda = (current?.avgKda || 0) * weight + participant.kda * newWeight;
    const avgDpm = (current?.avgDpm || 0) * weight + (participant.totalDamage / gameDurationMinutes) * newWeight;
    const avgGpm = (current?.avgGpm || 0) * weight + (participant.goldEarned / gameDurationMinutes) * newWeight;
    const avgCspm = (current?.avgCspm || 0) * weight + (participant.csGraph[participant.csGraph.length - 1] / gameDurationMinutes) * newWeight;
    const avgVisionScore = (current?.avgVisionScore || 0) * weight + participant.visionScore * newWeight;

    // Laning metrics (@15min)
    let avgCsd15 = current?.avgCsd15 || 0;
    let avgGd15 = current?.avgGd15 || 0;
    let avgXpd15 = current?.avgXpd15 || 0;

    if (opponent) {
      const csd15 = (participant.csGraph[15] || 0) - (opponent.csGraph[15] || 0);
      const gd15 = (participant.goldGraph[15] || 0) - (opponent.goldGraph[15] || 0);
      const xpd15 = (participant.xpGraph[15] || 0) - (opponent.xpGraph[15] || 0);

      avgCsd15 = (current?.avgCsd15 || 0) * weight + csd15 * newWeight;
      avgGd15 = (current?.avgGd15 || 0) * weight + gd15 * newWeight;
      avgXpd15 = (current?.avgXpd15 || 0) * weight + xpd15 * newWeight;
    }

    // Distribuição de roles
    const roleDistribution = (current?.roleDistribution as Record<string, number>) || {};
    roleDistribution[participant.role] = (roleDistribution[participant.role] || 0) + 1;

    await this.prisma.playerChampionStats.upsert({
      where: {
        puuid_championId_patch_queueId: {
          puuid: participant.puuid,
          championId: participant.championId,
          patch,
          queueId: 420
        }
      },
      create: {
        puuid: participant.puuid,
        championId: participant.championId,
        patch,
        queueId: 420,
        gamesPlayed: 1,
        wins: participant.win ? 1 : 0,
        losses: participant.win ? 0 : 1,
        winRate: participant.win ? 100 : 0,
        avgKda: participant.kda,
        avgDpm: participant.totalDamage / gameDurationMinutes,
        avgCspm: participant.csGraph[participant.csGraph.length - 1] / gameDurationMinutes,
        avgGpm: participant.goldEarned / gameDurationMinutes,
        avgVisionScore: participant.visionScore,
        avgCsd15: opponent ? ((participant.csGraph[15] || 0) - (opponent.csGraph[15] || 0)) : 0,
        avgGd15: opponent ? ((participant.goldGraph[15] || 0) - (opponent.goldGraph[15] || 0)) : 0,
        avgXpd15: opponent ? ((participant.xpGraph[15] || 0) - (opponent.xpGraph[15] || 0)) : 0,
        roleDistribution: { [participant.role]: 1 },
        lastPlayedAt: new Date()
      },
      update: {
        gamesPlayed,
        wins,
        losses,
        winRate,
        avgKda,
        avgDpm,
        avgCspm,
        avgGpm,
        avgVisionScore,
        avgCsd15,
        avgGd15,
        avgXpd15,
        roleDistribution,
        lastPlayedAt: new Date()
      }
    });
  }

  /**
   * Identifica oponente de lane (mesmo role, teamId oposto)
   */
  findLaneOpponent(
    participants: ParticipantData[],
    currentParticipant: ParticipantData
  ): ParticipantData | null {
    return participants.find(
      p =>
        p.role === currentParticipant.role &&
        p.teamId !== currentParticipant.teamId
    ) || null;
  }
}
```

### Integração no WorkerService

```typescript
// src/modules/worker/worker.service.ts

async processMatch(payload: ProcessMatchDto): Promise<void> {
  // ... código existente ...

  // 5. Load - Salvar transacionalmente
  await this.saveMatchData(matchData, timelineData);

  // 6. NOVO: Atualizar agregações de jogadores
  await this.updatePlayerAggregates(matchData, timelineData);
}

private async updatePlayerAggregates(
  matchData: ProcessedMatchData,
  timelineData: ParsedTimelineData
): Promise<void> {
  const patch = this.extractPatch(matchData.match.gameVersion);
  const gameDurationMinutes = matchData.match.gameDuration / 60;

  for (const participant of matchData.participants) {
    // Buscar dados de timeline
    const timelineParticipant = timelineData.participants.get(participant.puuid);

    const participantData = {
      ...participant,
      goldGraph: timelineParticipant?.goldGraph || [],
      xpGraph: timelineParticipant?.xpGraph || [],
      csGraph: timelineParticipant?.csGraph || [],
      damageGraph: timelineParticipant?.damageGraph || []
    };

    // Identificar oponente de lane
    const opponent = this.playerStatsAggregation.findLaneOpponent(
      matchData.participants.map(p => ({
        ...p,
        goldGraph: timelineData.participants.get(p.puuid)?.goldGraph || [],
        xpGraph: timelineData.participants.get(p.puuid)?.xpGraph || [],
        csGraph: timelineData.participants.get(p.puuid)?.csGraph || [],
        damageGraph: timelineData.participants.get(p.puuid)?.damageGraph || []
      })),
      participantData
    );

    // Atualizar agregações
    await this.playerStatsAggregation.updatePlayerAggregates(
      participantData,
      opponent,
      patch,
      gameDurationMinutes
    );
  }
}
```

---

## Testes

```bash
# 1. Buscar jogador para popular agregações
curl -X POST http://localhost:3000/api/v1/players/search \
  -H "Content-Type: application/json" \
  -d '{ "gameName": "TestPlayer", "tagLine": "BR1" }'

# Aguardar Worker processar...

# 2. Verificar summary
curl http://localhost:3000/api/v1/players/abc123/summary

# 3. Verificar champions
curl "http://localhost:3000/api/v1/players/abc123/champions?sortBy=winRate&limit=5"

# 4. Verificar roles
curl http://localhost:3000/api/v1/players/abc123/roles

# 5. Verificar activity heatmap
curl http://localhost:3000/api/v1/players/abc123/activity
```

### Verificação SQL

```sql
-- Ver player stats criados (lifetime + current patch)
SELECT puuid, patch, gamesPlayed, wins, winRate, avgKda, topChampions
FROM player_stats
WHERE puuid = 'abc123'
ORDER BY patch NULLS FIRST;

-- Ver champion stats
SELECT championId, patch, gamesPlayed, winRate, avgKda, avgCsd15, roleDistribution
FROM player_champion_stats
WHERE puuid = 'abc123'
  AND patch IS NULL
ORDER BY gamesPlayed DESC
LIMIT 5;
```
