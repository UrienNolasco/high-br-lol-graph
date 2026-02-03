# Schema Prisma V2 (High Granularity)

## Visão Geral
Este schema prioriza a performance de **leitura** de gráficos e mapas. Usamos arrays nativos do Postgres (`Int[]`, `String[]`) para séries temporais.

```prisma
model Match {
  matchId       String   @id
  gameCreation  BigInt
  gameDuration  Int
  gameMode      String
  queueId       Int      @index // Filtro essencial
  gameVersion   String
  mapId         Int
  
  // Status do processamento (ETL)
  hasTimeline   Boolean  @default(false) 

  teams         MatchTeam[]
  participants  MatchParticipant[]
  timeline      MatchTimeline? // Dados globais da timeline (se necessário)

  @@map("matches")
}

model MatchParticipant {
  // --- CHAVES E RELACIONAMENTOS ---
  matchId       String
  puuid         String
  match         Match    @relation(fields: [matchId], references: [matchId], onDelete: Cascade)

  // --- IDENTIDADE (Indexados para busca rápida) ---
  summonerName  String
  championId    Int      @index
  championName  String
  teamId        Int
  role          String
  lane          String
  win           Boolean

  // --- ESTATÍSTICAS FINAIS (Match V5) ---
  kills         Int
  deaths        Int
  assists       Int
  kda           Float
  goldEarned    Int
  totalDamage   Int      // Total damage to champions
  visionScore   Int
  
  // --- SÉRIES TEMPORAIS (TIMELINE OPTIMIZATION) ---
  // Arrays onde o índice = minuto da partida. 
  // Ex: goldGraph[10] = Ouro aos 10 minutos. Leitura instantânea p/ gráficos.
  goldGraph     Int[]    
  xpGraph       Int[]
  csGraph       Int[]    // Minions + Monsters
  damageGraph   Int[]    // Dano total acumulado até aquele minuto

  // --- MAPAS DE CALOR E POSICIONAMENTO ---
  // Armazenamos coordenadas X,Y compactadas.
  // Ex: [{x: 100, y: 500, time: 60000}, ...]
  deathPositions  Json   // Onde esse jogador morreu
  killPositions   Json   // Onde esse jogador matou
  wardPositions   Json   // Onde colocou wards
  pathingSample   Json   // Amostragem de posição (ex: a cada 1 min) para ver rota

  // --- COMPORTAMENTO DETALHADO ---
  // Ordem exata de skills: ["Q", "E", "W", "Q", ...]
  skillOrder      String[] 
  
  // Evolução de Itens: [{itemId: 1055, timestamp: 65000, type: "BUY"}]
  itemTimeline    Json     

  // Dados Brutos (Fallback)
  runes           Json     // Árvore completa de runas
  challenges      Json     // Objeto challenges completo da Riot
  pings           Json     // Todos os tipos de pings agrupados
  spells          Int[]    // Summoner Spells IDs

  @@id([matchId, puuid]) // Chave composta
  @@index([puuid])
  @@map("match_participants")
}

model MatchTeam {
  id          Int     @id @default(autoincrement())
  matchId     String
  teamId      Int
  win         Boolean
  
  bans        Int[]
  
  // Objetivos com timestamp para timeline de objetivos
  // Ex: [{type: "DRAGON", subtype: "HEXTECH", timestamp: 1250000}, ...]
  objectivesTimeline Json 

  match Match @relation(fields: [matchId], references: [matchId], onDelete: Cascade)
  @@map("match_teams")
}

// Opcional: Se quisermos guardar eventos globais neutros
model MatchTimeline {
  matchId     String  @id
  match       Match   @relation(fields: [matchId], references: [matchId], onDelete: Cascade)
  events      Json    // Eventos globais que não cabem no participante (ex: Pause, Game End)
  @@map("match_timelines")
}