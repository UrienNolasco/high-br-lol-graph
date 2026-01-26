# Modelagem de Dados (Schema Prisma)

## Diretriz Geral

O Schema deve ser híbrido: Relacional para dados de busca frequente (SQL rápido) e JSONB para dados de exibição detalhada (NoSQL flexível).

## 1. Tabela `Match` (Metadata)

Armazena o contexto da partida.

- **PK:** `matchId` (String) - Ex: "BR1_123456"
- **Campos Essenciais:**
  - `gameCreation` (BigInt) - _Timestamp de criação._
  - `gameDuration` (Int) - _Em segundos._
  - `gameMode` (String) - _Ex: CLASSIC, ARAM._
  - `queueId` (Int) - _Crucial para filtrar Ranked Solo (420) vs Flex (440)._
  - `gameVersion` (String) - _Para controle de Patch._
  - `mapId` (Int)
- **Relações:** `teams` (1:N), `participants` (1:N).

## 2. Tabela `MatchTeam`

- **Campos:** `teamId` (Int - 100/200), `win` (Boolean).
- **Bans:** `Int[]` - _Array simples de Champion IDs._
- **Objectives:** `Json` - _Armazena o objeto completo de objetivos (Baron, Dragon, Horde, RiftHerald, Tower, Inhibitor)._

## 3. Tabela `MatchParticipant` (O Coração do Sistema)

Esta tabela deve conter tudo necessário para renderizar a tela de "Match Details" no Mobile.

### Seção A: Identidade e Placar (Colunas Nativas)

- `puuid` (String) - **@index**
- `summonerName` (String)
- `championId` (Int) - **@index**
- `championName` (String)
- `teamId` (Int)
- `role` (String), `lane` (String), `individualPosition` (String)
- `win` (Boolean)
- `kills` (Int), `deaths` (Int), `assists` (Int), `kda` (Float)

### Seção B: Economia e Performance (Colunas Nativas)

- `goldEarned` (Int), `goldSpent` (Int)
- `totalMinionsKilled` (Int), `neutralMinionsKilled` (Int)
- `totalDamageDealtToChampions` (BigInt), `totalDamageTaken` (BigInt)
- `visionScore` (Int), `wardsPlaced` (Int), `wardsKilled` (Int), `detectorWardsPlaced` (Int)

### Seção C: Dados Complexos (Mapeamento Específico)

Estas colunas exigem lógica de transformação no Worker.

- `items`: `Int[]`
  - _Origem:_ `item0`, `item1`, `item2`, `item3`, `item4`, `item5`, `item6`.
- `summoners`: `Int[]`
  - _Origem:_ `summoner1Id`, `summoner2Id`.
- `runes`: `Json`
  - _Origem:_ Objeto `perks` do JSON original. Contém árvore primária, secundária e status mods.
- `challenges`: `Json`
  - _Origem:_ Objeto `challenges` do JSON. Contém centenas de métricas (turretPlates, soloKills, etc).
- `pings`: `Json`
  - _Origem:_ **Não existe objeto pings no JSON.** O Agente deve varrer todas as chaves do participante. Se a chave terminar em `...Pings` (ex: `enemyMissingPings`, `onMyWayPings`, `pushPings`), ela deve ser movida para dentro deste objeto JSON.

## 4. Manutenção de Legado

- Manter a tabela `ChampionStats` exatamente como existe hoje. Ela será o destino da agregação, mas não deve ser alterada estruturalmente nesta etapa.
