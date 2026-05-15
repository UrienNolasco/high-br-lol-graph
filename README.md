# High BR LoL Graph — Arquitetura do Backend

Backend em NestJS que coleta dados da Riot API, processa partidas de League of Legends, e serve estatísticas para o app mobile via API REST.

---

## Visão Geral

```
┌─────────────┐     ┌──────────────┐     ┌──────────┐     ┌──────────┐
│   Riot API  │◄────│  RiotService  │◄────│   Redis  │     │PostgreSQL│
│  (externa)  │     │  (throttle)   │     │(gatekeep)│     │          │
└─────────────┘     └──────────────┘     └────┬─────┘     └────┬─────┘
                           ▲                   │                │
                           │                   │                │
            ┌──────────────┼───────────────────┼────────────────┤
            │              │                   │                │
     ┌──────┴──────┐ ┌─────┴──────┐  ┌────────┴───────┐ ┌────┴─────┐
     │  Collector   │ │  Players   │  │  SyncService   │ │Main API  │
     │  (cron/30min)│ │ (search)   │  │  (deep sync)   │ │(read DB) │
     └──────┬───────┘ └─────┬──────┘  └───────┬────────┘ └──────────┘
            │               │                  │
            │  dedup via DB │ dedup via DB     │ dedup + track in Redis
            ▼               ▼                  ▼
     ┌───────────────────────────────────────────────┐
     │                  RabbitMQ                      │
     │  Prioridade 10: busca do usuário               │
     │  Prioridade  5: deep sync                      │
     │  Prioridade  1: background (collector)          │
     └───────────────────────┬───────────────────────┘
                             │
                     ┌───────┴───────┐
                     │  Worker Pool   │
                     │                │
                     │  1. findUnique (idempotência)
                     │  2. getMatchById → throttle() → Redis
                     │  3. getTimeline  → throttle() → Redis
                     │  4. Parse + Save transacional
                     │  5. Aggregations (ChampionStats, PlayerStats)
                     └───────┬───────┘
                             │
                     ┌───────┴───────┐
                     │  PostgreSQL   │
                     └───────────────┘
```

---

## Fluxo de Dados

### 3 Caminhos de Ingestão de Dados

| Caminho | Gatilho | Prioridade | Chamadas à Riot API | Chamadas ao Redis (throttle) |
|---------|---------|------------|-------------------------------|------------------------------|
| **Collector** | Cron a cada 30min (1h-8h) | 1 (baixa) | 3 ligas + 1 por jogador | 3 ligas + 1 por jogador |
| **Player Search** | `POST /players/search` | 10 (máxima) | Account + Summoner + League + Match IDs (4+) | 4+ por busca |
| **Deep Sync** | `POST /players/:puuid/sync` | 5 (média) | 100 match IDs ranqueados | 1 por sync + atualizações Redis |

---

### Caminho 1: Collector (Background)

```
Cron (a cada 30min, janela 1h-8h)
  → isEnabled? (Redis: collector:enabled)
  → getHighEloPuids()
      → throttle(apiKey) para cada liga                    ← Redis Lock + Rate Limit
          → GET /lol/league/v4/challengerleagues/by-queue/RANKED_SOLO_5x5
          → GET /lol/league/v4/grandmasterleagues/by-queue/RANKED_SOLO_5x5
          → GET /lol/league/v4/masterleagues/by-queue/RANKED_SOLO_5x5
      → throttled(apiKey) para cada jogador               ← Redis Lock + Rate Limit
          → GET /lol/match/v5/matches/by-puuid/{puuid}/ids?count=20
  → Para cada matchId:
      → checkIfMatchIsNew(matchId)                        ← PostgreSQL findUnique
      → Se novo: publishBackgroundMatch(matchId)          ← RabbitMQ prioridade 1
  → Salva collector:last_run no Redis
```

**Detalhe importante — getHighEloPuids():** O Collector faz **3 chamadas separadas** à Riot API para buscar as 3 ligas:
1. `GET /lol/league/v4/challengerleagues/by-queue/RANKED_SOLO_5x5` ← throttle(apiKey)
2. `GET /lol/league/v4/grandmasterleagues/by-queue/RANKED_SOLO_5x5` ← throttle(apiKey)
3. `GET /lol/league/v4/masterleagues/by-queue/RANKED_SOLO_5x5` ← throttle(apiKey)

Depois, para **cada jogador único retornado**, faz mais 1 chamada para buscar seus match IDs. Se Challenger+Grandmaster+Master retornarem 700 jogadores, são 3 + 700 = **703 chamadas à Riot API no total**, cada uma passando por `throttle()`.

**Chaves Redis usadas pelo Collector:**
- `collector:enabled` — flag on/off (string "true"/"false")
- `collector:start_hour` — hora de início da janela (default: 1)
- `collector:end_hour` — hora de fim da janela (default: 8)
- `collector:last_run` — timestamp da última execução

---

### Caminho 2: Player Search (Trigger Manual)

```
POST /api/v1/players/search { gameName, tagLine }
  → RiotService.getAccountByRiotId()                     ← throttle(apiKey)
  → RiotService.getSummonerByPuuid()                    ← throttle(apiKey)
  → RiotService.getRankedStatsByPuuid()                 ← throttle(apiKey)
  → RiotService.getMatchIdsByPuuid(puuid, 20)          ← throttle(apiKey)
  → Prisma match.findMany (checha quais já existem)
  → Para cada matchId novo:
      → queueService.publishUserRequestedMatch(matchId)  ← RabbitMQ prioridade 10
  → Prisma user.upsert (salva/atualiza perfil do jogador)
  → Retorna { puuid, gameName, tagLine, profileIconId, summonerLevel, matchesEnqueued }
```

---

### Caminho 3: Deep Sync (Histórico Profundo)

```
POST /api/v1/players/:puuid/sync
  → Verifica se jogador existe no DB
  → Checa idempotência: sync:puuid:status (Redis hash)
      → Se já está SYNCING, retorna status existente
  → RiotService.getMatchIdsByPuuid(puuid, 100, { queue: 420 })  ← throttle(apiKey)
  → Diff contra DB: Prisma match.findMany
  → Salva estado no Redis:
      → HSET sync:puuid:status { state: SYNCING, startedAt, matchesTotal }
      → SADD sync:puuid:matchIds ... (com TTL de 30min)
  → Para cada matchId novo:
      → queueService.publishDeepSyncMatch(matchId)               ← RabbitMQ prioridade 5
  → Se nenhum match novo: marca como DONE imediatamente
  → Retorna { puuid, status, matchesEnqueued, matchesTotal, matchesAlreadyInDb }
```

**Status polling:**
```
GET /api/v1/players/:puuid/sync-status
  → Lê sync:puuid:status (Redis hash)
  → Conta quantos matchIds já estão no DB
  → Se processed >= total → marca como DONE
  → Retorna { puuid, status, matchesProcessed, matchesTotal, startedAt }
```

---

## Redis como Porteiro

O Redis tem **2 papéis críticos** no sistema: **Lock Distribuído** e **Rate Limiter**. Todo acesso à Riot API passa por ambos, nessa ordem:

### Fluxo `throttle(apiKey)`

```
1. acquireLock("riot_rate_limiter_lock:<apiKeyHash>")
   → SET lock:riot_rate_limiter_lock:<apiKeyHash> "locked" PX 130000 NX
   → Retry: 100 tentativas, 50ms entre cada
   → Se falhar: throttled() faz retry com delay de 2x RETRY_DELAY_MS

2. Dentro do lock (while true):
   a. zremrangebyscore("riot_requests:<apiKeyHash>", "-inf", windowStart)
      → Remove timestamps expirados da janela (2 minutos)

   b. zcard("riot_requests:<apiKeyHash>")
      → Conta requisições na janela atual

   c. Se count < 100:
      → zadd("riot_requests:<apiKeyHash>", currentTime, currentTime)
      → Permissão concedida, sai do loop

   d. Se count >= 100:
      → Aguarda 1 segundo (RETRY_DELAY_MS)
      → Volta ao passo (a)

3. releaseLock("riot_rate_limiter_lock:<apiKeyHash>")
   → DEL lock:riot_rate_limiter_lock:<apiKeyHash>
```

**Parâmetros configurados:**
- Janela: 120 segundos (2 minutos)
- Máximo de requisições por janela: 100 (por API key)
- Lock TTL: 130 segundos (130000ms)
- Lock retry: 100 tentativas × 50ms = 5 segundos máximo
- Rate limit retry: 1 segundo entre tentativas (loop while)

**Isolamento por API key:** Cada API key gera um hash SHA-256 truncado (16 chars), criando chaves Redis separadas (`riot_requests:<hash>` e `lock:riot_rate_limiter_lock:<hash>`). Isso permite que múltiplas API keys da Riot sejam usadas simultaneamente sem competirem pelo mesmo contador — cada key tem sua própria janela de 100 requisições/2 minutos.

**Lock acquisition failure:** Se `acquireLock()` falhar após 100 tentativas (5 segundos), o `throttle()` chama a si mesmo recursivamente com `await this.delay(this.RETRY_DELAY_MS * 2)` (2 segundos). Em prática, isso significa que se todos os locks estiverem ocupados (alta contenção), o pedido é agendado para retry. Isso é importante para escalabilidade: se múltiplos workers ou o Collector competirem pelo mesmo lock, o pedido não é perdido — apenas atrasado.

---

## Worker: Processamento de Partida

O Worker consome mensagens do RabbitMQ e processa cada partida:

```
consume("match.collect") ou consume("user.update")
  → processMatch({ matchId })
      │
      ├─ 1. Idempotência Check
      │     → Prisma match.findUnique({ where: { matchId } })
      │     → Se já existe: SKIP (log + ack)
      │
      ├─ 2. Buscar Match + Timeline em PARALELO
      │     → Promise.all([
      │           riotService.getMatchById(matchId),    ← throttle(apiKey) [1 lock + rate check]
      │           riotService.getTimeline(matchId)      ← throttle(apiKey) [1 lock + rate check]
      │        ])
      │     → **2 chamadas throttle() por partida**
      │
├─ 3. Se timeline === null (404):
   │     → Ignora a partida (partida antiga ou modo especial)
   │     → Log: "Match {matchId} sem timeline disponível. Ignorando partida."
   │     → ACK da mensagem (não processa, mas remove da fila)
      │
      ├─ 4. Parse e Transformação
      │     → buildParticipantMap(): ParticipantID (1-10) → PUUID
      │     → parseMatchData(): dados do Match (kills, gold, kda, etc.)
      │     → timelineParser.parseTimeline(): séries temporais + eventos
      │
      ├─ 5. Save Transacional
      │     → Prisma $transaction:
      │        → match.create
      │        → matchTeam.createMany (2 times)
      │        → matchParticipant.createMany (10 participantes com timeline data)
      │
      ├─ 6. Aggregations (fora da transação)
      │     → updatePlayerAggregates():
      │        → Para cada participante:
      │           → findLaneOpponent() (mesmo role, time oposto)
      │           → PlayerStats.upsert (lifetime "ALL" + patch específico)
      │           → PlayerChampionStats.upsert (lifetime "ALL" + patch específico)
      │     → updateChampionStats():
      │        → Para cada participante:
      │           → ChampionStats.upsert (por champion/patch/queueId)
      │
      └─ 7. ACK (sucesso) ou NACK (erro, sem requeue)
```

### Idempotência: 3 Camadas de Proteção

| Camada | Mecanismo | Onde |
|--------|-----------|------|
| **1** | `match.findUnique` antes de processar | WorkerService.processMatch() |
| **2** | Prisma P2002 unique constraint error | catch no WorkerService |
| **3** | RabbitMQ ack/nack — ack só no sucesso, nack sem requeue no erro | WorkerController |

> **Nota:** Se o Worker falhar (erro inesperado), a mensagem é perdida (nack sem requeue). Isso é uma decisão intencional: o Collector re-coletará essa partida no próximo ciclo.

### Timeline Parser: O que é Extraído

O `TimelineParserService` extrai de cada frame da timeline:

| Dado | Formato | Exemplo |
|------|---------|---------|
| `goldGraph` | `number[]` (índice = minuto) | `[1200, 1800, 2400, ...]` |
| `xpGraph` | `number[]` (índice = minuto) | `[600, 1200, 2000, ...]` |
| `csGraph` | `number[]` (índice = minuto) | `[6, 18, 32, ...]` |
| `damageGraph` | `number[]` (índice = minuto) | `[500, 1200, 2800, ...]` |
| `killPositions` | `{x, y, timestamp}[]` | Posição no mapa |
| `deathPositions` | `{x, y, timestamp}[]` | Posição no mapa |
| `wardPositions` | `{wardType, x, y, timestamp}[]` | Posição no mapa |
| `pathingSample` | `{x?, y?, time}[]` | Amostragem de posição |
| `skillOrder` | `string[]` | `["Q", "W", "E", "Q", ...]` |
| `itemTimeline` | `{itemId, timestamp, type}[]` | BUY/SELL/UNDO |

---

## Fila: RabbitMQ

### Configuração

- **Queue**: `default_queue` (configurável via `RABBITMQ_QUEUE`)
- **Durável**: sim (`durable: true`)
- **Prioridade máxima**: 10 (`x-max-priority: 10`)
- **Mensagens persistentes**: sim (`persistent: true`)

### 3 Níveis de Prioridade

| Prioridade | Método | Gatilho | Caso de Uso |
|------------|--------|---------|-------------|
| **10** (máxima) | `publishUserRequestedMatch()` | `POST /players/search` | Usuário acabou de buscar um jogador |
| **5** (média) | `publishDeepSyncMatch()` | `POST /players/:puuid/sync` | Usuário pediu histórico completo |
| **1** (mínima) | `publishBackgroundMatch()` | Collector cron | Coleta automática de fundo |

### Formato da Mensagem

```json
{
  "pattern": "match.collect",
  "data": {
    "matchId": "BR1_1234567890"
  }
}
```

### Eventos Consumidos

| Pattern | Descrição |
|---------|-----------|
| `match.collect` | Processamento padrão de partida (background + deep sync) |
| `user.update` | Atualização solicitada pelo usuário (prioridade 10) |

---

## API Reference

### Players (`/api/v1/players`)

| Método | Path | Descrição | Destaques |
|--------|------|-----------|-----------|
| `POST` | `/search` | Busca jogador por Riot ID | Faz 4+ chamadas à Riot API, enfileira partidas novas com prioridade 10 |
| `GET` | `/:puuid` | Perfil do jogador (cacheado no DB) | Dados: gameName, tagLine, tier, rank, LP, wins, losses |
| `GET` | `/:puuid/status` | Status de processamento de partidas | Verifica quantas das 20 últimas partidas já foram processadas |
| `GET` | `/:puuid/summary?patch=` | Resumo macro do jogador | winRate, avgKda, avgDpm, avgGpm, avgCspm, avgVisionScore, topChampions |
| `GET` | `/:puuid/champions?patch=&role=&limit=&sortBy=` | Lista de campeões do jogador | Suporta filtro por role, ordenação por games/winRate/kda |
| `GET` | `/:puuid/roles?patch=` | Distribuição de papéis e winrate | GROUP BY role com agregações |
| `GET` | `/:puuid/activity?patch=` | Heatmap de atividade 7×24 | Grid de 168 células (7 dias × 24 horas) |
| `GET` | `/:puuid/matches?...` | Histórico de partidas (paginado) | Suporta cursor, page, filtros por champion/role/result/sortBy |
| `POST` | `/:puuid/sync` | Dispara deep sync (100 partidas ranqueadas) | Prioridade 5, tracking via Redis |
| `GET` | `/:puuid/sync-status` | Progresso do deep sync | Lê de Redis hash + conta matches no DB |

### Matches (`/api/v1/matches`)

| Método | Path | Descrição | Destaques |
|--------|------|-----------|-----------|
| `GET` | `/:matchId` | Detalhes completos da partida | Match + Teams + Participants (tudo em uma query) |
| `GET` | `/:matchId/timeline/gold` | Timeline de ouro por minuto | Detecta throw point (swing > 3000 gold) |
| `GET` | `/:matchId/timeline/events` | Kills, deaths, wards, objectives | Posições (x,y) para heatmap |
| `GET` | `/:matchId/builds` | Timeline de itens e build final | BUY/SELL/UNDO com timestamps |
| `GET` | `/:matchId/performance/:puuid` | Comparação jogador vs oponente de lane | DPM, GPM, CSPM, Vision vs adversário direto |

### Champions (`/api/v1/champions`)

| Método | Path | Descrição |
|--------|------|-----------|
| `GET` | `/` | Lista todos os campeões com imagens |
| `GET` | `/current-patch` | Lista todas as patches disponíveis |

### Stats (`/api/v1/stats`)

| Método | Path | Descrição | Destaques |
|--------|------|-----------|-----------|
| `GET` | `/champions?patch=&page=&limit=&sortBy=&order=` | Tier list paginada de campeões | Ordenável por winRate/games/kda/dpm/gpm/banRate/pickRate |
| `GET` | `/champions/:championName?patch=` | Stats de um campeão específico | Inclui tier/rank calculado |
| `GET` | `/processed-matches?patch=` | Contagem de partidas processadas | Útil para saber cobertura de dados |

### Analytics (`/api/v1/analytics`)

| Método | Path | Descrição | Destaques |
|--------|------|-----------|-----------|
| `GET` | `/compare?heroPuuid=&villainPuuid=&patch=&role=&championId=` | Compara dois jogadores | Stats, laning phase (CSD@15, GD@15, XPD@15), timeline CS/Gold, insights auto-gerados |

### Collector (`/api/v1/collector`)

Endpoints dedicados do Collector (também disponíveis via `/api/v1/admin/collector/*`):

| Método | Path | Descrição |
|--------|------|-----------|
| `GET` | `/status` | Status do Collector (enabled, isRunning, lastRun, startHour, endHour) |
| `POST` | `/enable` | Habilita o Collector |
| `POST` | `/disable` | Desabilita o Collector |
| `POST` | `/trigger` | Dispara coleta manual |

### Admin (`/api/v1/admin`)

| Método | Path | Descrição |
|--------|------|-----------|
| `GET` | `/rate-limit` | Status atual do rate limiter (requests na janela, canProceed) |
| `POST` | `/rate-limit/reset` | Reseta contadores do rate limit (limpa todas as chaves `riot_requests:*`) |
| `GET` | `/collector` | Status do Collector (mesmo que `/api/v1/collector/status`) |
| `POST` | `/collector/enable` | Habilita o Collector |
| `POST` | `/collector/disable` | Desabilita o Collector |
| `POST` | `/collector/trigger` | Dispara coleta manual |

---

## Pipeline de Agregações

Para cada partida processada, o Worker atualiza **4 tabelas de agregação**:

### 1. ChampionStats
```
upsert por chave: championId + patch + queueId
Campos calculados: gamesPlayed, wins, losses, winRate, kda, dpm, gpm, cspm, banRate, pickRate, tier
Média ponderada: novo_valor = valor_anterior × (games-1/games) + novo_valor × (1/games)
```

### 2. PlayerStats (lifetime + patch)
```
upsert por chave: puuid + patch + queueId
 rods parcelas: "ALL" (lifetime) e patch específico (ex: "15.23")
Campos: gamesPlayed, wins, losses, winRate, avgKda, avgDpm, avgGpm, avgCspm, avgVisionScore
roleDistribution: { "MID": 45, "TOP": 12, ... }
topChampions: top 5 por gamesPlayed
```

### 3. PlayerChampionStats (lifetime + patch)
```
upsert por chave: puuid + championId + patch + queueId
 rods parcelas: "ALL" (lifetime) e patch específico
Campos: mesmos de PlayerStats + avgCsd15, avgGd15, avgXpd15 (vs lane opponent)
```

### 4. ChampionStats (tier/rank)
```
calculateChampionScore() calcula tier (S+, S, A, B, C, D) e rank baseado em:
- winRate, kda, dpm, gpm, cspm (métricas atuais)
- Comparação com patch anterior (delta)
- Mínimo de 50 jogos para tier definitivo
```

---

## Estrutura de Diretórios

```
src/
├── main.ts                                    ← Bootstrap NestJS
├── app.module.ts                              ← Módulo raiz
├── app.controller.ts                          ← Health check
├── core/
│   ├── config/                                ← ConfigModule
│   ├── prisma/                                ← PrismaService (DB)
│   ├── lock/
│   │   ├── lock.service.ts                    ← Distributed lock via Redis SET NX PX
│   │   └── lock.module.ts
│   ├── queue/
│   │   ├── queue.service.ts                  ← RabbitMQ publisher (prioridades 1/5/10)
│   │   ├── queue.module.ts                   ← Conexão com retry
│   │   └── queue.constants.ts
│   ├── riot/
│   │   ├── riot.service.ts                   ← Cliente Riot API (todas as chamadas)
│   │   ├── rate-limiter.service.ts           ← Sliding window + distributed lock
│   │   ├── retry.service.ts                  ← Exponential backoff (5 tentativas)
│   │   ├── match-parser.service.ts           ← Parse de dados do Match V5
│   │   ├── timeline-parser.service.ts        ← Parse de Timeline V5
│   │   └── dto/                              ← DTOs (Account, Summoner, League, Match, Timeline)
│   ├── data-dragon/                          ← Champion data + imagens
│   ├── stats/
│   │   ├── player-stats-aggregation.service.ts  ← PlayerStats + PlayerChampionStats upsert
│   │   └── stats.module.ts
│   └── interceptors/
│       └── bigint.interceptor.ts             ← Converte BigInt para String no JSON
├── modules/
│   ├── collector/
│   │   ├── collector.service.ts              ← Cron job: busca high-elo + enfileira
│   │   ├── collector.controller.ts           ← Admin endpoints
│   │   └── collector.module.ts
│   ├── worker/
│   │   ├── worker.service.ts                ← Processamento de partida (ETL)
│   │   ├── worker.controller.ts             ← RabbitMQ consumer
│   │   ├── worker.module.ts
│   │   └── dto/process-match.dto.ts
│   ├── players/
│   │   ├── players.service.ts               ← Busca, perfil, summary, champions, activity, matches
│   │   ├── players.controller.ts            ← 10 endpoints
│   │   ├── sync.service.ts                  ← Deep sync (Redis tracking)
│   │   ├── players.module.ts
│   │   └── dto/                             ← PlayerSearch, PlayerProfile, Summary, etc.
│   ├── matches/
│   │   ├── matches.service.ts               ← Detalhes, timeline gold, events, builds, performance
│   │   ├── matches.controller.ts            ← 5 endpoints
│   │   └── matches.module.ts
│   ├── champions/
│   │   ├── champions.service.ts             ← Lista de campeões + patch atual
│   │   ├── champions.controller.ts           ← 2 endpoints
│   │   └── champions.module.ts
│   ├── stats/
│   │   ├── stats.service.ts                 ← Tier list paginada
│   │   ├── tier-rank.service.ts              ← Cálculo de tier/rank
│   │   ├── stats.controller.ts              ← 3 endpoints
│   │   └── stats.module.ts
│   ├── analytics/
│   │   ├── analytics.service.ts             ← Compare 2 players
│   │   ├── analytics.controller.ts           ← 1 endpoint
│   │   └── analytics.module.ts
│   └── admin/
│       ├── admin.controller.ts               ← Rate limit + Collector admin
│       └── admin.module.ts
```

---

## Exemplos de Request/Response

### Buscar jogador (Player Search)

```bash
# Request
curl -X POST http://localhost:3000/api/v1/players/search \
  -H "Content-Type: application/json" \
  -d '{"gameName": "BrTT", "tagLine": "BR1"}'

# Response
{
  "puuid": "abc123-def456-ghi789...",
  "gameName": "BrTT",
  "tagLine": "BR1",
  "profileIconId": 3789,
  "summonerLevel": 492,
  "matchesEnqueued": 5
}
```

> `matchesEnqueued` indica quantas partidas novas foram enfileiradas com prioridade 10.

### Deep Sync (Histórico Profundo)

```bash
# Trigger
curl -X POST http://localhost:3000/api/v1/players/{puuid}/sync

# Response
{
  "puuid": "abc123...",
  "status": "SYNCING",
  "matchesEnqueued": 45,
  "matchesTotal": 100,
  "matchesAlreadyInDb": 55,
  "message": "Deep sync iniciado: 45 partidas enfileiradas"
}

# Poll status
curl http://localhost:3000/api/v1/players/{puuid}/sync-status

# Response
{
  "puuid": "abc123...",
  "status": "SYNCING",
  "matchesProcessed": 30,
  "matchesTotal": 45,
  "startedAt": "2026-05-14T12:00:00Z",
  "message": "Sync em andamento: 30/45 partidas processadas"
}
```

### Detalhes de Partida

```bash
curl http://localhost:3000/api/v1/matches/BR1_1234567890
```

### Status do Collector

```bash
curl http://localhost:3000/api/v1/admin/collector
# Response: { "enabled": true, "isRunning": false, "lastRun": "...", "startHour": 1, "endHour": 8 }
```

---

## Glossário de Campos

| Campo | Tipo | Descrição | Origem |
|-------|------|-----------|--------|
| `puuid` | String | Identificador único do jogador na Riot API | Riot Account API |
| `gameCreation` | BigInt → String | Timestamp (ms) de criação da partida. Retornado como string no JSON (BigInt não é serializável) | Riot Match V5 |
| `queueId` | Int | Tipo de fila. **420 = Ranked Solo/Duo** (principal fila filtrada no backend) | Riot Match V5 |
| `patch` | String | Versão do patch extraída de `gameVersion`. Formato: `"15.23"` (de `"15.23.1"`) | Calculado |
| `winRate` | Float (0-100) | Porcentagem de vitórias. **Não é 0-1**, é 0-100 | Calculado |
| `kda` | Float | KDA ratio = (kills + assists) / deaths (minimum deaths = 1) | Calculado |
| `gameDuration` | Int | Duração em segundos | Riot Match V5 |
| `role` | String | Posição do jogador: TOP, JUNGLE, MIDDLE, BOTTOM, UTILITY | Riot Match V5 |
| `tier` | String | Tier do campeão: S+, S, A, B, C, D | Calculado pelo TierRankService |
| `matchesEnqueued` | Int | Quantas partidas foram enfileiradas no RabbitMQ | Calculado |
| `SYNCING` / `DONE` / `IDLE` | Enum | Status do deep sync armazenado no Redis | SyncService |

---

## Retry Service

O `RetryService` envolve TODAS as chamadas à Riot API com retry exponencial:

```
executeWithRetry(operation, operationName, maxRetries=5)
  → Tentativa 1: falhou? delay = 2000ms + random(0-1000)
  → Tentativa 2: falhou? delay = 4000ms + random(0-1000)
  → Tentativa 3: falhou? delay = 8000ms + random(0-1000)
  → Tentativa 4: falhou? delay = 10000ms (cap) + random(0-1000)
  → Tentativa 5: falhou? throw error
```

**Combinado com o RateLimiterService**, cada tentativa ainda passa por `throttle()`, garantindo que retries nunca ultrapassam o rate limit.

---

## Comportamento em Falhas

| Cenário | Comportamento |
|---------|---------------|
| Riot API retorna 404 para timeline | Worker ignora a partida (log warning) |
| Riot API retorna 429 (rate limited) | RateLimiterService já gerencia internamente |
| Dois workers processam o mesmo matchId | Segundo worker: Prisma P2002 → skip com warning |
| Worker crasha durante processamento | Mensagem é nack'd (sem requeue) — partida será re-coletada pelo Collector |
| Redis cai | LockService falha após 100 retries (~5s), RateLimiterService falha, chamadas à Riot API são bloqueadas |
| RabbitMQ cai | Collector/SyncService não conseguem enfileirar partidas, mas continuam processando outros jogadores |
| PostgreSQL cai | Worker crasha, mensagem é nack'd, sistema para |

---

## Variáveis de Ambiente

| Variável | Default | Descrição |
|----------|---------|-----------|
| `RIOT_API_KEY` | — | Chave da Riot API (obrigatória) |
| `DATABASE_URL` | — | URL de conexão PostgreSQL (Prisma, obrigatória) |
| `REDIS_HOST` | `redis` | Host do Redis (localhost em dev, redis em Docker) |
| `REDIS_PORT` | `6379` | Porta do Redis |
| `RABBITMQ_URL` | — | URL completa do RabbitMQ (ex: `amqp://user:pass@host:5672`) |
| `RABBITMQ_HOST` | — | Host do RabbitMQ (alternativa, usado se RABBITMQ_URL não definido) |
| `RABBITMQ_DEFAULT_USER` | — | Usuário do RabbitMQ |
| `RABBITMQ_DEFAULT_PASS` | — | Senha do RabbitMQ |
| `RABBITMQ_QUEUE` | `default_queue` | Nome da fila |
| `COLLECTOR_ENABLED` | `false` | Collector ativo por default |
| `COLLECTOR_START_HOUR` | `1` | Início da janela de coleta (hora, UTC) |
| `COLLECTOR_END_HOUR` | `8` | Fim da janela de coleta (hora, UTC) |
| `PORT` | `3000` | Porta do servidor HTTP principal |
| `COLLECTOR_PORT` | `3001` | Porta do Collector (quando em modo separado) |
| `APP_MODE` | — | Modo da aplicação (usado para bootstrap diferenciado) |