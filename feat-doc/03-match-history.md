# Feature 03: Match History

## Visão Geral

Endpoint para histórico de partidas do jogador com filtros e paginação. **Já implementado**, apenas necessita documentação e possíveis melhorias de filtros.

---

## Endpoint

### GET /api/v1/players/:puuid/matches

**Descrição:** Lista resumida de partidas com suporte a filtros avançados.

**Query Params:**
- `queueId` (optional, default: 420): Tipo de fila (420 = Ranked Solo/Duo)
- `championId` (optional): Filtrar por campeão específico
- `role` (optional): Filtrar por role (TOP, JUNGLE, MID, BOTTOM, UTILITY)
- `cursor` (optional): Cursor de paginação (matchId da última partida)
- `limit` (default: 20, max: 50): Número de partidas a retornar

**Response:**
```json
{
  "puuid": "abc123def456",
  "matches": [
    {
      "matchId": "BR1_3216549870",
      "championId": 157,
      "championName": "Yasuo",
      "role": "MID",
      "lane": "MIDDLE",
      "kills": 10,
      "deaths": 3,
      "assists": 8,
      "kda": 6.0,
      "goldEarned": 15420,
      "totalDamage": 28500,
      "visionScore": 25,
      "cspm": 8.1,
      "win": true,
      "gameCreation": 1738752000000,
      "gameDuration": 1845,
      "queueId": 420
    },
    {
      "matchId": "BR1_3216549869",
      "championId": 238,
      "championName": "Zed",
      "role": "MID",
      "lane": "MIDDLE",
      "kills": 5,
      "deaths": 7,
      "assists": 4,
      "kda": 1.29,
      "goldEarned": 12800,
      "totalDamage": 22400,
      "visionScore": 18,
      "cspm": 7.5,
      "win": false,
      "gameCreation": 1738665600000,
      "gameDuration": 1680,
      "queueId": 420
    }
  ],
  "nextCursor": "BR1_3216549869",
  "hasMore": true
}
```

**Campos:**
| Campo | Tipo | Descrição |
|-------|------|-----------|
| matchId | string | ID único da partida |
| championId | int | ID do campeão jogado |
| championName | string | Nome do campeão |
| role | string | Role primária (TOP, JUNGLE, MID, BOTTOM, UTILITY) |
| lane | string | Lane específica (TOP, JUNGLE, MIDDLE, BOTTOM, UTILITY) |
| kills | int | Número de abates |
| deaths | int | Número de mortes |
| assists | int | Número de assistências |
| kda | float | (Kills + Assists) / Deaths |
| goldEarned | int | Ouro total ganho |
| totalDamage | int | Dano total causado a campeões |
| visionScore | int | Score de visão |
| cspm | float | Farm por minuto |
| win | boolean | Vitória ou derrota |
| gameCreation | long | Timestamp da partida (ms) |
| gameDuration | int | Duração em segundos |
| queueId | int | Tipo de fila |

---

## Schema Prisma (Já Existe)

### MatchParticipant

```prisma
model MatchParticipant {
  matchId       String
  puuid         String
  match         Match    @relation(fields: [matchId], references: [matchId], onDelete: Cascade)

  summonerName  String
  championId    Int
  championName  String
  teamId        Int
  role          String
  lane          String
  win           Boolean

  // Estatísticas finais (Match V5)
  kills         Int
  deaths        Int
  assists       Int
  kda           Float
  goldEarned    Int
  totalDamage   Int
  visionScore   Int

  // Séries temporais (Timeline V5) - índice = minuto
  goldGraph     Int[]
  xpGraph       Int[]
  csGraph       Int[]
  damageGraph   Int[]

  // Heatmaps e posicionamento
  deathPositions  Json
  killPositions   Json
  wardPositions   Json
  pathingSample   Json

  // Comportamento detalhado
  skillOrder      String[]
  itemTimeline    Json

  // Dados brutos (JSONB)
  runes           Json
  challenges      Json
  pings           Json
  spells          Int[]

  @@id([matchId, puuid])
  @@index([puuid])
  @@index([championId])
  @@map("match_participants")
}
```

---

## Fluxo de Dados

```
Request: GET /api/v1/players/abc123/matches?championId=157&limit=20&cursor=BR1_123
  ↓
ApiController.getPlayerMatches(puuid, query)
  ↓
ApiService.getPlayerMatches(puuid, filters):
  ├─ 1. Query MatchParticipant (where: puuid, championId, role)
  ├─ 2. Join Match (para gameCreation, gameDuration, queueId)
  ├─ 3. Se cursor: where matchId < cursor (ordem DESC)
  ├─ 4. Ordenar por Match.gameCreation DESC
  ├─ 5. Limit + 1 (para detectar hasMore)
  └─ 6. Calcular CSPM (csGraph[last] / gameDurationMinutes)
  ↓
Response: PlayerMatchesDto
```

**SQL Query:**
```sql
SELECT
  mp.*,
  m."gameCreation",
  m."gameDuration",
  m."queueId"
FROM match_participants mp
JOIN matches m ON mp."matchId" = m."matchId"
WHERE mp.puuid = 'abc123'
  AND m."queueId" = 420  -- filtro queueId
  AND mp."championId" = 157  -- filtro opcional championId
  AND mp.role = 'MID'  -- filtro opcional role
  AND (
    -- Cursor pagination
    $cursor IS NULL OR m."gameCreation" < (
      SELECT "gameCreation" FROM matches WHERE "matchId" = $cursor
    )
  )
ORDER BY m."gameCreation" DESC
LIMIT 21;  -- limit + 1 para detectar hasMore
```

---

## Implementação (ApiService)

```typescript
async getPlayerMatches(
  puuid: string,
  filters: {
    queueId?: number;
    championId?: number;
    role?: string;
    cursor?: string;
    limit?: number;
  }
): Promise<PlayerMatchesDto> {
  const limit = Math.min(filters.limit || 20, 50);
  const queueId = filters.queueId || 420;

  // Construir where clause
  const where: any = {
    puuid,
    match: {
      queueId
    }
  };

  if (filters.championId) {
    where.championId = filters.championId;
  }

  if (filters.role) {
    where.role = filters.role;
  }

  // Cursor pagination
  if (filters.cursor) {
    const cursorMatch = await this.prisma.match.findUnique({
      where: { matchId: filters.cursor },
      select: { gameCreation: true }
    });
    if (cursorMatch) {
      where.match.gameCreation = { lt: cursorMatch.gameCreation };
    }
  }

  // Query matches (limit + 1 para detectar hasMore)
  const matches = await this.prisma.matchParticipant.findMany({
    where,
    include: {
      match: {
        select: {
          gameCreation: true,
          gameDuration: true,
          queueId: true
        }
      }
    },
    orderBy: {
      match: {
        gameCreation: 'desc'
      }
    },
    take: limit + 1
  });

  // Detectar se há mais partidas
  const hasMore = matches.length > limit;
  const resultMatches = matches.slice(0, limit);

  // Calcular CSPM
  const enrichedMatches = resultMatches.map(match => {
    const gameDurationMinutes = match.match.gameDuration / 60;
    const cspm = match.csGraph.length > 0
      ? match.csGraph[match.csGraph.length - 1] / gameDurationMinutes
      : 0;

    return {
      matchId: match.matchId,
      championId: match.championId,
      championName: match.championName,
      role: match.role,
      lane: match.lane,
      kills: match.kills,
      deaths: match.deaths,
      assists: match.assists,
      kda: match.kda,
      goldEarned: match.goldEarned,
      totalDamage: match.totalDamage,
      visionScore: match.visionScore,
      cspm: parseFloat(cspm.toFixed(2)),
      win: match.win,
      gameCreation: Number(match.match.gameCreation),
      gameDuration: match.match.gameDuration,
      queueId: match.match.queueId
    };
  });

  return {
    puuid,
    matches: enrichedMatches,
    nextCursor: hasMore ? enrichedMatches[enrichedMatches.length - 1].matchId : null,
    hasMore
  };
}
```

---

## Melhorias Sugeridas

### 1. Adicionar filtro por período

**Query Param:**
- `startDate` (optional): Timestamp início (ms)
- `endDate` (optional): Timestamp fim (ms)

**SQL:**
```sql
WHERE m."gameCreation" >= $startDate
  AND m."gameCreation" <= $endDate
```

### 2. Adicionar filtro por resultado

**Query Param:**
- `result` (optional): "win" | "loss"

**SQL:**
```sql
WHERE mp.win = true  -- ou false
```

### 3. Adicionar ordenação customizada

**Query Param:**
- `sortBy` (optional): "recent" | "kda" | "kills" | "damage"

**Implementação:**
```typescript
const orderBy = {
  recent: { match: { gameCreation: 'desc' } },
  kda: { kda: 'desc' },
  kills: { kills: 'desc' },
  damage: { totalDamage: 'desc' }
}[filters.sortBy || 'recent'];
```

---

## DTOs

### PlayerMatchDto (Item da lista)

```typescript
import { ApiProperty } from '@nestjs/swagger';

export class PlayerMatchDto {
  @ApiProperty({ example: 'BR1_3216549870' })
  matchId: string;

  @ApiProperty({ example: 157 })
  championId: number;

  @ApiProperty({ example: 'Yasuo' })
  championName: string;

  @ApiProperty({ example: 'MID' })
  role: string;

  @ApiProperty({ example: 'MIDDLE' })
  lane: string;

  @ApiProperty({ example: 10 })
  kills: number;

  @ApiProperty({ example: 3 })
  deaths: number;

  @ApiProperty({ example: 8 })
  assists: number;

  @ApiProperty({ example: 6.0 })
  kda: number;

  @ApiProperty({ example: 15420 })
  goldEarned: number;

  @ApiProperty({ example: 28500 })
  totalDamage: number;

  @ApiProperty({ example: 25 })
  visionScore: number;

  @ApiProperty({ example: 8.1 })
  cspm: number;

  @ApiProperty({ example: true })
  win: boolean;

  @ApiProperty({ example: 1738752000000 })
  gameCreation: number;

  @ApiProperty({ example: 1845 })
  gameDuration: number;

  @ApiProperty({ example: 420 })
  queueId: number;
}
```

### PlayerMatchesDto (Response wrapper)

```typescript
export class PlayerMatchesDto {
  @ApiProperty({ example: 'abc123def456' })
  puuid: string;

  @ApiProperty({ type: [PlayerMatchDto] })
  matches: PlayerMatchDto[];

  @ApiProperty({ example: 'BR1_3216549869', nullable: true })
  nextCursor: string | null;

  @ApiProperty({ example: true })
  hasMore: boolean;
}
```

### PlayerMatchesQueryDto (Query params)

```typescript
import { IsOptional, IsInt, Min, Max, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class PlayerMatchesQueryDto {
  @ApiProperty({ required: false, default: 420 })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  queueId?: number = 420;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  championId?: number;

  @ApiProperty({ required: false, enum: ['TOP', 'JUNGLE', 'MID', 'BOTTOM', 'UTILITY'] })
  @IsOptional()
  @IsIn(['TOP', 'JUNGLE', 'MID', 'BOTTOM', 'UTILITY'])
  role?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  cursor?: string;

  @ApiProperty({ required: false, default: 20, minimum: 1, maximum: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  @Type(() => Number)
  limit?: number = 20;
}
```

---

## Controller

```typescript
@Get(':puuid/matches')
@ApiOperation({ summary: 'Get player match history' })
@ApiResponse({ status: 200, description: 'Match history', type: PlayerMatchesDto })
async getPlayerMatches(
  @Param('puuid') puuid: string,
  @Query() query: PlayerMatchesQueryDto
): Promise<PlayerMatchesDto> {
  return this.apiService.getPlayerMatches(puuid, query);
}
```

---

## Testes

```bash
# 1. Listar últimas 20 partidas
curl "http://localhost:3000/api/v1/players/abc123/matches"

# 2. Filtrar por campeão
curl "http://localhost:3000/api/v1/players/abc123/matches?championId=157&limit=10"

# 3. Filtrar por role
curl "http://localhost:3000/api/v1/players/abc123/matches?role=MID"

# 4. Paginação (usar cursor do response anterior)
curl "http://localhost:3000/api/v1/players/abc123/matches?cursor=BR1_3216549869&limit=20"

# 5. Combinar filtros
curl "http://localhost:3000/api/v1/players/abc123/matches?championId=157&role=MID&limit=5"
```

### Verificação SQL

```sql
-- Contar total de partidas do jogador
SELECT COUNT(*)
FROM match_participants mp
JOIN matches m ON mp."matchId" = m."matchId"
WHERE mp.puuid = 'abc123'
  AND m."queueId" = 420;

-- Ver últimas 10 partidas
SELECT
  mp."matchId",
  mp."championName",
  mp.role,
  mp.kills,
  mp.deaths,
  mp.assists,
  mp.win,
  m."gameCreation"
FROM match_participants mp
JOIN matches m ON mp."matchId" = m."matchId"
WHERE mp.puuid = 'abc123'
  AND m."queueId" = 420
ORDER BY m."gameCreation" DESC
LIMIT 10;
```

---

## Performance Considerations

### Índices Recomendados

```sql
-- Já existe
CREATE INDEX idx_match_participants_puuid ON match_participants(puuid);

-- Adicionar para melhor performance em queries compostas
CREATE INDEX idx_match_participants_puuid_championId
  ON match_participants(puuid, "championId");

CREATE INDEX idx_match_participants_puuid_role
  ON match_participants(puuid, role);

-- Índice composto para cursor pagination eficiente
CREATE INDEX idx_matches_queueId_gameCreation
  ON matches("queueId", "gameCreation" DESC);
```

### Cache Considerations

Para jogadores com muitas partidas (>1000), considerar:
- Cache Redis para primeira página (últimas 20 partidas)
- TTL de 5 minutos
- Invalidar ao adicionar nova partida

---

## Observações

1. **Timeline Data:** Endpoint retorna dados **lightweight** (sem goldGraph, xpGraph, etc) para performance
2. **CSPM Calculation:** Calculado em runtime a partir do csGraph (último valor / duração)
3. **Cursor Pagination:** Preferível a offset para grandes volumes (evita OFFSET N que fica lento)
4. **QueueId Default:** 420 (Ranked Solo/Duo) é o padrão pois todas análises focam em ranked
5. **Join Performance:** MatchParticipant + Match join é rápido devido aos índices existentes
