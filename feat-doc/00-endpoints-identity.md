# Feature 00: Endpoints de Identidade do Jogador

## Visão Geral

Endpoints para carregar perfil do jogador e acompanhar status de atualização de dados. Foco em **cache** e **polling** para UX responsiva.

---

## Endpoints

### 1. GET /api/v1/players/:puuid

**Descrição:** Carregamento rápido do perfil completo do jogador (cacheado no banco).

**Parâmetros:**
- `puuid` (path): PUUID do jogador

**Response:**
```json
{
  "puuid": "abc123def456",
  "gameName": "Faker",
  "tagLine": "BR1",
  "region": "br1",
  "profileIconId": 4968,
  "summonerLevel": 487,
  "tier": "CHALLENGER",
  "rank": null,
  "leaguePoints": 1234,
  "rankedWins": 150,
  "rankedLosses": 120,
  "lastUpdated": "2026-02-05T10:30:00.000Z",
  "createdAt": "2026-01-15T08:00:00.000Z"
}
```

**Campos:**
| Campo | Tipo | Descrição |
|-------|------|-----------|
| puuid | string | Identificador único permanente do jogador |
| gameName | string | Nome in-game (ex: "Faker") |
| tagLine | string | Tag (ex: "BR1") |
| region | string | Região do servidor (padrão: "br1") |
| profileIconId | int | ID do ícone de perfil |
| summonerLevel | int | Nível do invocador |
| tier | string | Tier ranqueada (IRON, BRONZE, SILVER, GOLD, PLATINUM, EMERALD, DIAMOND, MASTER, GRANDMASTER, CHALLENGER) |
| rank | string | Divisão (I, II, III, IV) - null para Master+ |
| leaguePoints | int | Pontos de liga (LP) |
| rankedWins | int | Vitórias em ranked (solo/duo) |
| rankedLosses | int | Derrotas em ranked (solo/duo) |
| lastUpdated | datetime | Última vez que dados foram atualizados |
| createdAt | datetime | Quando o jogador foi adicionado ao sistema |

**Códigos de Status:**
- `200 OK`: Jogador encontrado
- `404 Not Found`: Jogador não existe no banco (nunca foi buscado)

---

### 2. GET /api/v1/players/:puuid/status

**Descrição:** Status de processamento de partidas em tempo real (polling endpoint). Frontend deve chamar a cada 5 segundos enquanto `status = "UPDATING"`.

**Parâmetros:**
- `puuid` (path): PUUID do jogador

**Response:**
```json
{
  "status": "UPDATING",
  "matchesProcessed": 15,
  "matchesTotal": 20,
  "queuePosition": 1,
  "estimatedCompletion": null,
  "message": "Processing matches... 15/20 complete"
}
```

**Campos:**
| Campo | Tipo | Descrição |
|-------|------|-----------|
| status | enum | "IDLE", "UPDATING", "ERROR" |
| matchesProcessed | int | Quantas partidas já foram processadas |
| matchesTotal | int | Total de partidas encontradas |
| queuePosition | int | Posição na fila RabbitMQ (1 = próxima) |
| estimatedCompletion | datetime | Estimativa de conclusão (null = desconhecido) |
| message | string | Mensagem descritiva para exibir ao usuário |

**Status:**
- `IDLE`: Todas as partidas já foram processadas, dados estão atualizados
- `UPDATING`: Há partidas pendentes na fila, ainda processando
- `ERROR`: Ocorreu erro no processamento (detalhes no campo message)

**Códigos de Status:**
- `200 OK`: Status retornado com sucesso

---

## Schema Prisma

### User (modelo estendido)

```prisma
model User {
  puuid          String   @id
  gameName       String
  tagLine        String
  region         String   @default("br1")

  // Profile data (Summoner-V4)
  profileIconId  Int?
  summonerLevel  Int?
  summonerId     String?  // Necessário para League-V4

  // Ranked data (League-V4) - apenas Ranked Solo/Duo
  tier           String?  // IRON, BRONZE, SILVER, GOLD, PLATINUM, EMERALD, DIAMOND, MASTER, GRANDMASTER, CHALLENGER
  rank           String?  // I, II, III, IV (null para Master+)
  leaguePoints   Int?
  rankedWins     Int?
  rankedLosses   Int?

  // Metadata
  lastUpdated    DateTime @default(now())
  createdAt      DateTime @default(now())

  @@unique([gameName, tagLine, region])
  @@index([gameName])
  @@index([tier])
  @@map("users")
}
```

---

## Fluxo de Dados

### GET /players/:puuid (Profile)

```
Request: GET /api/v1/players/abc123
  ↓
ApiController.getPlayerProfile(puuid)
  ↓
ApiService.getPlayerProfile(puuid)
  ↓
PrismaService.user.findUnique({ where: { puuid } })
  ↓
Response: User DTO
```

**SQL Query:**
```sql
SELECT * FROM users WHERE puuid = 'abc123';
```

---

### GET /players/:puuid/status (Polling)

```
Request: GET /api/v1/players/abc123/status
  ↓
ApiController.getPlayerUpdateStatus(puuid)
  ↓
ApiService.getPlayerUpdateStatus(puuid):
  ├─ 1. RiotService.getMatchIdsByPuuid(puuid) → Buscar últimas 20 partidas da API
  ├─ 2. PrismaService.match.findMany({ where: { matchId IN [...] } }) → Verificar quais existem
  ├─ 3. Calcular: matchesProcessed = existentes, matchesTotal = 20
  ├─ 4. QueueService.getQueuePosition(puuid) → Consultar RabbitMQ (OPCIONAL)
  └─ 5. Determinar status:
       - Se matchesProcessed === matchesTotal → "IDLE"
       - Se matchesProcessed < matchesTotal → "UPDATING"
  ↓
Response: Status DTO
```

**Lógica de Status:**
```typescript
const matchesInDb = await prisma.match.count({
  where: { matchId: { in: matchIdsFromRiot } }
});

const status = matchesInDb === matchIdsFromRiot.length ? 'IDLE' : 'UPDATING';
```

---

## Integração com Riot API

### League-V4 Integration

**Novo método em RiotService:**
```typescript
async getRankedStatsBySummonerId(summonerId: string): Promise<LeagueEntryDto[]> {
  const url = `${this.baseUrl}/lol/league/v4/entries/by-summoner/${summonerId}`;
  const response = await this.httpService.axiosRef.get(url, {
    headers: { 'X-Riot-Token': this.apiKey }
  });
  return response.data;
}
```

**LeagueEntryDto:**
```typescript
export interface LeagueEntryDto {
  leagueId: string;
  queueType: string; // "RANKED_SOLO_5x5", "RANKED_FLEX_SR"
  tier: string; // "IRON", "BRONZE", ..., "CHALLENGER"
  rank: string; // "I", "II", "III", "IV"
  summonerId: string;
  leaguePoints: number;
  wins: number;
  losses: number;
  veteran: boolean;
  inactive: boolean;
  freshBlood: boolean;
  hotStreak: boolean;
}
```

### Atualização do PlayersService.searchPlayer()

**Fluxo estendido:**
```typescript
async searchPlayer(dto: PlayerSearchDto): Promise<PlayerResponseDto> {
  // 1. Account-V1: gameName#tagLine → PUUID
  const account = await this.riotService.getAccountByRiotId(dto.gameName, dto.tagLine);

  // 2. Summoner-V4: PUUID → summonerId, profileIconId, level
  const summoner = await this.riotService.getSummonerByPuuid(account.puuid);

  // 3. NOVO: League-V4: summonerId → ranked stats
  const leagueEntries = await this.riotService.getRankedStatsBySummonerId(summoner.id);
  const rankedSolo = leagueEntries.find(e => e.queueType === 'RANKED_SOLO_5x5');

  // 4. Match-V5: PUUID → últimas 20 partidas
  const matchIds = await this.riotService.getMatchIdsByPuuid(account.puuid, 20);

  // 5. Diff check: filtrar partidas já existentes
  const existingMatches = await this.prisma.match.findMany({
    where: { matchId: { in: matchIds } },
    select: { matchId: true }
  });
  const newMatchIds = matchIds.filter(id => !existingMatches.some(m => m.matchId === id));

  // 6. Enqueue com prioridade ALTA (10)
  for (const matchId of newMatchIds) {
    await this.queueService.publishUserRequestedMatch(matchId);
  }

  // 7. Upsert User com TODOS os dados
  await this.prisma.user.upsert({
    where: { puuid: account.puuid },
    create: {
      puuid: account.puuid,
      gameName: account.gameName,
      tagLine: account.tagLine,
      region: 'br1',
      profileIconId: summoner.profileIconId,
      summonerLevel: summoner.summonerLevel,
      summonerId: summoner.id,
      tier: rankedSolo?.tier || null,
      rank: rankedSolo?.rank || null,
      leaguePoints: rankedSolo?.leaguePoints || null,
      rankedWins: rankedSolo?.wins || null,
      rankedLosses: rankedSolo?.losses || null,
    },
    update: {
      gameName: account.gameName,
      tagLine: account.tagLine,
      profileIconId: summoner.profileIconId,
      summonerLevel: summoner.summonerLevel,
      summonerId: summoner.id,
      tier: rankedSolo?.tier || null,
      rank: rankedSolo?.rank || null,
      leaguePoints: rankedSolo?.leaguePoints || null,
      rankedWins: rankedSolo?.wins || null,
      rankedLosses: rankedSolo?.losses || null,
      lastUpdated: new Date(),
    }
  });

  return {
    puuid: account.puuid,
    gameName: account.gameName,
    tagLine: account.tagLine,
    matchesEnqueued: newMatchIds.length
  };
}
```

---

## DTOs

### PlayerProfileDto (Response)

```typescript
import { ApiProperty } from '@nestjs/swagger';

export class PlayerProfileDto {
  @ApiProperty({ example: 'abc123def456' })
  puuid: string;

  @ApiProperty({ example: 'Faker' })
  gameName: string;

  @ApiProperty({ example: 'BR1' })
  tagLine: string;

  @ApiProperty({ example: 'br1' })
  region: string;

  @ApiProperty({ example: 4968, nullable: true })
  profileIconId?: number;

  @ApiProperty({ example: 487, nullable: true })
  summonerLevel?: number;

  @ApiProperty({ example: 'CHALLENGER', nullable: true })
  tier?: string;

  @ApiProperty({ example: null, nullable: true })
  rank?: string;

  @ApiProperty({ example: 1234, nullable: true })
  leaguePoints?: number;

  @ApiProperty({ example: 150, nullable: true })
  rankedWins?: number;

  @ApiProperty({ example: 120, nullable: true })
  rankedLosses?: number;

  @ApiProperty({ example: '2026-02-05T10:30:00.000Z' })
  lastUpdated: Date;

  @ApiProperty({ example: '2026-01-15T08:00:00.000Z' })
  createdAt: Date;
}
```

### PlayerUpdateStatusDto (Response)

```typescript
import { ApiProperty } from '@nestjs/swagger';

enum UpdateStatus {
  IDLE = 'IDLE',
  UPDATING = 'UPDATING',
  ERROR = 'ERROR',
}

export class PlayerUpdateStatusDto {
  @ApiProperty({ enum: UpdateStatus, example: 'UPDATING' })
  status: UpdateStatus;

  @ApiProperty({ example: 15 })
  matchesProcessed: number;

  @ApiProperty({ example: 20 })
  matchesTotal: number;

  @ApiProperty({ example: 1, nullable: true })
  queuePosition?: number;

  @ApiProperty({ example: null, nullable: true })
  estimatedCompletion?: Date;

  @ApiProperty({ example: 'Processing matches... 15/20 complete' })
  message: string;
}
```

---

## Implementação no ApiService

```typescript
// src/modules/api/api.service.ts

async getPlayerProfile(puuid: string): Promise<PlayerProfileDto> {
  const user = await this.prisma.user.findUnique({
    where: { puuid }
  });

  if (!user) {
    throw new NotFoundException(`Player with PUUID ${puuid} not found`);
  }

  return user;
}

async getPlayerUpdateStatus(puuid: string): Promise<PlayerUpdateStatusDto> {
  try {
    // 1. Buscar últimas 20 partidas da API do Riot
    const matchIdsFromRiot = await this.riotService.getMatchIdsByPuuid(puuid, 20);

    // 2. Verificar quantas já existem no banco
    const matchesInDb = await this.prisma.match.count({
      where: { matchId: { in: matchIdsFromRiot } }
    });

    const matchesProcessed = matchesInDb;
    const matchesTotal = matchIdsFromRiot.length;

    // 3. Determinar status
    const status: UpdateStatus = matchesProcessed === matchesTotal ? UpdateStatus.IDLE : UpdateStatus.UPDATING;

    return {
      status,
      matchesProcessed,
      matchesTotal,
      queuePosition: null, // Implementar consulta RabbitMQ se necessário
      estimatedCompletion: null,
      message: status === UpdateStatus.IDLE
        ? 'All matches processed'
        : `Processing matches... ${matchesProcessed}/${matchesTotal} complete`
    };
  } catch (error) {
    return {
      status: UpdateStatus.ERROR,
      matchesProcessed: 0,
      matchesTotal: 0,
      queuePosition: null,
      estimatedCompletion: null,
      message: `Error checking update status: ${error.message}`
    };
  }
}
```

---

## Implementação no ApiController

```typescript
// src/modules/api/api.controller.ts

import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('Players')
@Controller('api/v1/players')
export class ApiController {
  constructor(private readonly apiService: ApiService) {}

  @Get(':puuid')
  @ApiOperation({ summary: 'Get player profile' })
  @ApiResponse({ status: 200, description: 'Player profile', type: PlayerProfileDto })
  @ApiResponse({ status: 404, description: 'Player not found' })
  async getPlayerProfile(@Param('puuid') puuid: string): Promise<PlayerProfileDto> {
    return this.apiService.getPlayerProfile(puuid);
  }

  @Get(':puuid/status')
  @ApiOperation({ summary: 'Get player update status (polling)' })
  @ApiResponse({ status: 200, description: 'Update status', type: PlayerUpdateStatusDto })
  async getPlayerUpdateStatus(@Param('puuid') puuid: string): Promise<PlayerUpdateStatusDto> {
    return this.apiService.getPlayerUpdateStatus(puuid);
  }
}
```

---

## UX Flow no Frontend

### Fluxo de busca de jogador:

```
1. User digita "Faker#BR1" e clica em "Buscar"
   ↓
2. Frontend chama: POST /api/v1/players/search { gameName: "Faker", tagLine: "BR1" }
   ↓
3. Backend retorna: { puuid: "abc123", matchesEnqueued: 15 }
   ↓
4. Frontend redireciona para /profile/abc123
   ↓
5. Frontend carrega perfil: GET /api/v1/players/abc123 (FAST - cache)
   ↓
6. Frontend inicia polling (a cada 5s): GET /api/v1/players/abc123/status
   ↓
7. Enquanto status === "UPDATING":
   - Mostrar barra de progresso: "15/20 partidas processadas"
   - Continuar polling
   ↓
8. Quando status === "IDLE":
   - Parar polling
   - Recarregar stats da página (summary, champions, etc)
```

---

## Testes

### Teste E2E: Fluxo completo

```bash
# 1. Buscar jogador
curl -X POST http://localhost:3000/api/v1/players/search \
  -H "Content-Type: application/json" \
  -d '{ "gameName": "TestPlayer", "tagLine": "BR1" }'
# Response: { "puuid": "abc123", "matchesEnqueued": 15 }

# 2. Verificar perfil
curl http://localhost:3000/api/v1/players/abc123
# Response: { "puuid": "abc123", "gameName": "TestPlayer", ... }

# 3. Polling (repetir até status = IDLE)
curl http://localhost:3000/api/v1/players/abc123/status
# Response: { "status": "UPDATING", "matchesProcessed": 5, "matchesTotal": 15 }

# ... aguardar ...

curl http://localhost:3000/api/v1/players/abc123/status
# Response: { "status": "IDLE", "matchesProcessed": 15, "matchesTotal": 15 }
```

### Verificação SQL

```sql
-- Verificar se User foi criado corretamente
SELECT puuid, gameName, tagLine, tier, rank, leaguePoints, summonerId
FROM users
WHERE gameName = 'TestPlayer' AND tagLine = 'BR1';

-- Verificar se ranked stats foram salvos
SELECT tier, rank, leaguePoints, rankedWins, rankedLosses
FROM users
WHERE puuid = 'abc123';
```

---

## Observações Importantes

1. **Cache:** Endpoint `/players/:puuid` retorna dados do banco (rápido), NÃO chama API do Riot
2. **Polling:** Endpoint `/status` deve ser otimizado para não sobrecarregar (considerar cache de 3-5 segundos)
3. **Ranked Stats:** Apenas Ranked Solo/Duo (queueType = "RANKED_SOLO_5x5"), ignorar Flex
4. **Master+:** Campos `rank` e `division` são null para tiers Master, Grandmaster e Challenger
5. **summonerId:** Obrigatório salvar para futuras chamadas League-V4
