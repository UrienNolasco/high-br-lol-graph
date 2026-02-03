# Lógica ETL Avançada: Match + Timeline (The "Omniscient" Worker)

## 1. Objetivo do Script

Este worker é responsável por ingerir dados de dois endpoints distintos da Riot (Match V5 e Timeline V5), sincronizá-los e transformar os dados brutos em um formato otimizado para leitura (Arrays de Série Temporal e JSONs Espaciais).

## 2. Fluxo de Execução (Pipeline)

### Passo 1: Ingestão Paralela (Extract)

Não espere um terminar para pedir o outro. Use concorrência.

```typescript
// Exemplo de extração
const matchId = job.data.matchId;
const [matchDto, timelineDto] = await Promise.all([
  riotApi.getMatch(matchId),
  riotApi.getTimeline(matchId) // Atenção: Tratar 404 se a timeline não existir (ex: partidas muito antigas)
]);

Passo 2: Processamento da Timeline (Transform - Heavy Lifting)
A Timeline é composta por uma lista de frames (minutos). Precisamos iterar sobre ela apenas uma vez para extrair tudo (O(n)).

Inicialize estruturas de dados temporárias para cada participante (Map ou Array indexado pelo ID 1-10).

A. Geração de Gráficos (Time Series Arrays)
Para cada frame em timelineDto.info.frames:

Iterar sobre participantFrames (1 a 10).

Extrair valores: totalGold, xp, minionsKilled, jungleMinionsKilled, totalDamageDoneToChampions.

Dar push nos arrays correspondentes do participante (goldGraph, xpGraph, csGraph, damageGraph).

Resultado: goldGraph será um array tipo [500, 750, 1200, ...] onde o índice é o minuto.

B. Extração Espacial (Heatmaps & Events)
Para cada frame, iterar sobre a lista de events.

Eventos de Morte (CHAMPION_KILL):

Ler position.x, position.y e timestamp.

Identificar killerId (Quem matou) -> Adicionar coordenada ao array killPositions desse participante.

Identificar victimId (Quem morreu) -> Adicionar coordenada ao array deathPositions desse participante.

Nota: Se killerId for 0 (Minion/Torre), ignorar o killPosition.

Eventos de Visão (WARD_PLACED):

Ler creatorId.

Adicionar {x, y, timestamp, wardType} ao array wardPositions.

Eventos de Build (ITEM_PURCHASED, ITEM_SOLD):

Ler participantId.

Adicionar {itemId, timestamp, type: "BUY"} ao array itemTimeline.

Eventos de Habilidade (SKILL_LEVEL_UP):

Ler participantId e skillSlot (1=Q, 2=W, 3=E, 4=R).

Converter ID numérico para String ("Q", "W"...).

Dar push no array skillOrder.

Passo 3: Mapeamento do Match V5 (Transform - Base Stats)
Agora, mapeie o matchDto para o objeto MatchParticipant do Prisma.

Dados Nativos: Copiar KDA, Win, VisionScore, Totals.

Arrays: Converter item0..item6 para items: number[].

JSONs Complexos (O "Maluco dos Dados"):

runes: Copiar o objeto perks inteiro.

challenges: Copiar o objeto challenges inteiro (contém as 130 métricas).

pings: Varredura de chaves. Iterar sobre todas as propriedades do participante. Se a chave terminar em "Pings" (ex: enemyMissingPings), mover para um objeto pingsData.

Passo 4: Fusão (Merge)
Unir os dados processados no Passo 2 (Arrays/Mapas da Timeline) com o objeto do Passo 3.

O objeto final participantCreateInput deve ter tanto o kda (do Match) quanto o goldGraph (da Timeline).

Passo 5: Carga Transacional (Load)
Salvar tudo atomicamente para evitar dados parciais.

await prisma.$transaction(async (tx) => {
  // 1. Criar a Match (Metadata)
  const match = await tx.match.create({
    data: {
      matchId: matchDto.metadata.matchId,
      // ... metadados ...
      hasTimeline: true // Flag importante
    }
  });

  // 2. Criar Times (Com Timeline de Objetivos se extraída)
  await tx.matchTeam.createMany({ data: teamsData });

  // 3. Criar Participantes (O Payload Gigante)
  // Recomenda-se createMany se o driver suportar JSON, ou loop de create
  for (const p of participantsData) {
    await tx.matchParticipant.create({ data: p });
  }
});

3. Tratamento de Exceções
Timeline Ausente (404): Partidas muito antigas ou modos rotativos podem não ter timeline.

Ação: Logar aviso, definir hasTimeline: false e salvar apenas os dados do Match V5 (deixar os arrays de gráfico vazios).

Match Já Existe:

Ação: Implementar verificação de idempotência no início (findUnique). Se já existe, pular processamento.
```
