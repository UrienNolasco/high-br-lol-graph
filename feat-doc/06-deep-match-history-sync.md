# Deep Match History Sync

## Context

Atualmente o `POST /api/v1/players/search` busca apenas as **20 partidas mais recentes** (sem filtro de queue) via Riot Match-V5 API. O usuário precisa de um mecanismo para buscar o **histórico profundo** de partidas ranqueadas (Solo/Duo), enfileirando-as para processamento com feedback de progresso.

**Decisões do usuário:**
- Limite: 100 partidas (1 chamada Riot API)
- Prioridade na fila: 5 (média)
- Feedback: polling endpoint
- Filtro: apenas Ranked Solo/Duo (queue=420)

---

## Arquivos a Modificar

### 1. `src/core/riot/riot.service.ts` (linha 136-150)
Adicionar parâmetros `start` e `queue` ao `getMatchIdsByPuuid`:

```typescript
async getMatchIdsByPuuid(
  puuid: string,
  count = 20,
  options?: { start?: number; queue?: number },
): Promise<string[]> {
```

Construir URL com `URLSearchParams` incluindo `start` e `queue` quando fornecidos. Totalmente retrocompatível — chamadas existentes usam apenas `(puuid, count)`.

### 2. `src/core/queue/queue.service.ts` (após linha 70)
Adicionar método `publishDeepSyncMatch` com prioridade 5:

```typescript
publishDeepSyncMatch(matchId: string): void {
  this.publish('match.collect', { matchId }, { priority: 5 });
}
```

### 3. `src/modules/players/players.controller.ts`
Adicionar 2 novos endpoints injetando `SyncService`:

- **`POST :puuid/sync`** — dispara deep sync, retorna contagem de enfileiradas
- **`GET :puuid/sync-status`** — polling de progresso

Sem conflito de rotas: `PlayersApiController` tem `GET :puuid/status`, nosso é `GET :puuid/sync-status`.

### 4. `src/modules/players/players.module.ts`
Registrar `SyncService` como provider e adicionar `ConfigModule` aos imports.

---

## Arquivos a Criar

### 5. `src/modules/players/sync.service.ts`
Serviço principal com Redis para tracking:

**`triggerDeepSync(puuid)`:**
1. Verifica player existe no DB (`user.findUnique`)
2. Checa idempotência no Redis — se já SYNCING, retorna status existente
3. Chama `riotService.getMatchIdsByPuuid(puuid, 100, { start: 0, queue: 420 })`
4. Diff contra DB (`match.findMany` + filtro)
5. Salva no Redis: status hash + set de matchIds (TTL 30min)
6. Enfileira novos matches via `queueService.publishDeepSyncMatch()`
7. Retorna `SyncTriggerResponseDto`

**`getSyncStatus(puuid)`:**
1. Lê estado do Redis (`HGETALL sync:{puuid}:status`)
2. Lê matchIds do Redis (`SMEMBERS sync:{puuid}:matchIds`)
3. Conta quantos existem no DB (`match.count where matchId in [...]`)
4. Se processados >= total, atualiza estado para DONE
5. Retorna `SyncStatusResponseDto`

**Redis keys:**
- `sync:{puuid}:status` → Hash `{ state, startedAt, matchesTotal }` (TTL 30min)
- `sync:{puuid}:matchIds` → Set de matchIds sendo rastreados (TTL 30min)

Redis via `ioredis` direto (padrão do projeto: `CollectorService`, `LockService`, `RateLimiterService`).

### 6. `src/modules/players/dto/sync-response.dto.ts`
Dois DTOs:

**`SyncTriggerResponseDto`:**
```
{ puuid, status, matchesEnqueued, matchesTotal, matchesAlreadyInDb, message }
```

**`SyncStatusResponseDto`:**
```
{ puuid, status: IDLE|SYNCING|DONE|ERROR, matchesProcessed, matchesTotal, startedAt, message }
```

---

## O que NÃO muda

- **Worker**: nenhuma modificação. Já processa `match.collect` independente da origem. Prioridade é tratada pelo RabbitMQ.
- **Aggregation**: já hardcoded para queueId=420, alinhado com o filtro de Solo/Duo.
- **Collector**: continua operando normalmente com prioridade 1.

---

## Edge Cases

| Cenário | Tratamento |
|---------|------------|
| Player não existe no DB | 404 — precisa chamar `/players/search` primeiro |
| Sync já em andamento | Retorna status existente, `matchesEnqueued: 0` |
| 0 matches retornados pela Riot | Retorna `matchesTotal: 0`, sem estado no Redis |
| Todos os matches já no DB | `matchesEnqueued: 0`, status transiciona para DONE no próximo poll |
| Worker pula match (sem timeline) | `matchesProcessed` pode não atingir `matchesTotal` — aceitável |
| TTL Redis expira durante sync | Próximo poll retorna IDLE — sync stale é limpo automaticamente |

---

## Ordem de Implementação

1. Modificar `RiotService.getMatchIdsByPuuid` (retrocompatível)
2. Adicionar `QueueService.publishDeepSyncMatch`
3. Criar `dto/sync-response.dto.ts`
4. Criar `sync.service.ts`
5. Modificar `PlayersController` (adicionar endpoints + injetar SyncService)
6. Modificar `PlayersModule` (registrar SyncService + ConfigModule)

---

## Verificação

1. Chamar `POST /api/v1/players/search` com um jogador
2. Chamar `POST /api/v1/players/:puuid/sync` — verificar resposta com `matchesEnqueued`
3. Chamar `GET /api/v1/players/:puuid/sync-status` repetidamente — verificar progresso
4. Chamar sync novamente enquanto em andamento — verificar idempotência
5. Verificar no RabbitMQ que messages têm prioridade 5
