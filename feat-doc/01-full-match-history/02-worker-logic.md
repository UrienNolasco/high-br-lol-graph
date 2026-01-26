# Lógica do Worker (Pipeline ETLA)

## Contexto

O Worker deve ser reescrito para abandonar a lógica antiga. Ele agora opera em dois estágios distintos: **Persistência** e **Agregação**.

## Estágio 1: Persistência (Raw Data)

### 1.1 Mapper (Transformação)

Criar uma função `mapRiotMatchToPrisma(matchDto)` que sanitiza os dados antes do banco.

- **Tratamento de Pings:**
  ```typescript
  // Pseudocódigo da lógica obrigatória
  const pings = {};
  for (const [key, value] of Object.entries(participantDto)) {
    if (key.endsWith('Pings')) {
      pings[key] = value;
    }
  }
  // Salvar 'pings' na coluna JSONB
  ```
- **Tratamento de Arrays:** Consolidar itens e summoners em arrays de inteiros.
- **Tratamento de BigInt:** Garantir que valores de dano sejam compatíveis com BigInt do Prisma.

### 1.2 Carga (Load)

Executar dentro de uma `prisma.$transaction`:

1.  Verificar se `Match` já existe (`matchId`). Se sim, retornar (Idempotência).
2.  Criar `Match`.
3.  Criar `MatchTeam` (x2) com dados aninhados.
4.  Criar `MatchParticipant` (x10) com dados aninhados.

## Estágio 2: Agregação (Incremental Aggregation)

### 2.1 Trigger

**Imediatamente após** o sucesso da transação acima (e fora dela, para não travar o banco), chamar `StatisticsService.processMatchStats(matchId)`.

### 2.2 Lógica de Agregação

O Service deve buscar a partida recém-criada no banco (via `prisma.match.findUnique... include participants`).
**Para cada participante**, executar um `UPSERT` na tabela `ChampionStats`:

- **Where:** `{ patch: match.gameVersion, championId: participant.championId }`
- **Create:**
  - `gamesPlayed`: 1
  - `wins`: 1 se `participant.win` for true, senão 0.
  - `totalKills`: `participant.kills`
  - ... (somar kda, farm, gold)
- **Update (Increment):**
  - `gamesPlayed`: `{ increment: 1 }`
  - `wins`: `{ increment: 1 }` (apenas se ganhou)
  - `totalKills`: `{ increment: participant.kills }`
  - ... (incrementar o resto)

## Benefício Técnico

Ao ler do banco para agregar (em vez de ler do JSON), garantimos que **nunca** haverá discrepância entre o histórico da partida e a estatística do campeão. Se o dado está no banco, ele foi contado.
