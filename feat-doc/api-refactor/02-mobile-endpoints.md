# Refatoração: API Endpoints (Mobile Consumer)

## Novo Controller: `MatchesController`

### 1. Endpoint: Histórico do Jogador (Leve)

- **GET** `/players/{puuid}/matches?take=20`
- **Query Otimizada:**
  - NÃO incluir `goldGraph`, `xpGraph`, `positions`.
  - Selecionar apenas: `championName`, `kills`, `deaths`, `assists`, `win`, `gameCreation`, `items` (apenas IDs).
- **Objetivo:** Renderizar a lista de partidas com scroll infinito fluído.

### 2. Endpoint: Detalhes da Partida (Pesado)

- **GET** `/matches/{matchId}`
- **Query:** `prisma.match.findUnique({ include: { participants: true, teams: true } })`
- **Tratamento de Dados (Response DTO):**
  - Converter `BigInt` para `String`.
  - O Mobile receberá os arrays `goldGraph` (Int[]) diretos. Não precisa processar nada, apenas jogar no componente de Chart.
  - O Mobile receberá `killPositions` (JSON) diretos. Apenas iterar e desenhar pontos no mapa.

---

## Novo Controller: `PlayerAnalysisController` (O Coach)

### 3. Endpoint: Performance vs Média

- **GET** `/analysis/{matchId}/{puuid}`
- **Lógica:**
  - Ler `goldGraph` do jogador nessa partida.
  - Comparar com a média de ouro do Elo/Campeão (que virá do `ChampionStats`).
  - **Retorno:** JSON com "dicas":
    - _"Aos 15min você estava 2k de ouro atrás da média."_
    - _"Você colocou 3 wards a menos que o normal."_
