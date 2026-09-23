# Eventos normalizados — MET-04

IDs do catálogo: O01, V01, V02, E08, C08, C09, O02, O04 e B04. Esta entrega projeta evidências de eventos; não calcula ainda wards válidas, mortes evitáveis, solo kills, lutas ou relações causais.

## Identidade, fonte e versões

`MatchEventProjection` tem chave composta `(matchId, frameIndex, eventIndex)`, índices base zero na timeline original. O timestamp não é chave nem critério de deduplicação: eventos distintos com o mesmo timestamp e frames duplicados permanecem distintos. `payload` guarda o objeto integral, inclusive tipos/campos futuros, recaps, item undo, bounty e GAME_END. `MatchRaw` permanece preservado. A fixture real BR1_3200579475 contém **41 frames e 1.966 eventos**, todos projetados (18 tipos distintos).

`metricVersion=1` identifica a definição inicial desta normalização. `processingVersion=2` identifica a nova geração persistida, compartilhada com a projeção de snapshots MET-03. `processedAt` registra a escrita em UTC. Processar novamente um job COMPLETED não realiza backfill. A migration cria apenas a tabela/índices/FK; o rebuild offline existente é obrigatório para preencher eventos antigos e corrigir as coordenadas legadas de wards. As três rotas legadas continuam disponíveis; o contrato de `NormalizedTimelineEventDto` é registrado no OpenAPI para consumo pelas próximas métricas/relatório MET-17, sem nova rota nesta task.

## Definições e ausência

- `timestampMs` e `frameTimestampMs`: milissegundos desde o início, extraídos separadamente do evento e frame. Não há janela, denominador estatístico nem arredondamento: cada linha representa um evento observado na sua posição de origem. Não se filtra por patch/queue/duração na projeção; o contexto da partida permanece no Match. A semântica de tipos conhecidos foi conferida na fixture 16.2/420/mapa11, não declarada universal para patches futuros.
- `actorParticipantId` usa creatorId em WARD_PLACED, killerId em kills/remoção de ward/objetivos e participantId em item/skill/level. `actorPuuid` e vítima vêm do mapa validado do resumo. IDs positivos não resolvidos ficam preservados com PUUID null e qualidade `unresolvedParticipantIds`; não se cria participante. ID zero é sentinela ambiental: ID normalizado e PUUID null, com campo sinalizado em `sentinelFields`. O zero original permanece no payload.
- Assistentes ausentes resultam em null; lista observada vazia resulta em []. IDs positivos não resolvidos permanecem na lista, com null na posição correspondente de `assistingPuuids`. Sentinelas/inválidos são sinalizados e não viram jogadores. Consumidores não podem inferir solo kill a partir de uma lista filtrada sem verificar a qualidade e o payload.
- `sourceTeamId` vem do time do autor no resumo, nunca da faixa numérica do participantId. Monstro épico também fornece killerTeamId explícito. `ownerTeamId` guarda teamId da estrutura destruída em BUILDING_KILL/TURRET_PLATE_DESTROYED; `beneficiaryTeamId` é o outro time, somente se o dono for 100/200. Assim, killerId=0 pode ter beneficiário válido sem criar autor. Para ELITE_MONSTER_KILL o beneficiário é killerTeamId explícito; soul/bounty usam teamId; GAME_END usa winningTeam. Zero/time desconhecido não é transformado em 100/200. Conflito entre time do ator e informação explícita fica em `quality.conflicts`; o beneficiário explícito continua preservado.
- `lane` e `tier` preservam laneType/towerType; demais detalhes estão no payload. Não se transforma enum desconhecido em outro tipo conhecido no registro normalizado. Evento de tipo futuro permanece com seu tipo original, payload e `quality.unknownType=true`, sem interpretação inventada de autor/beneficiário.
- `positionX/Y`: somente coordenadas presentes no evento. WARD_PLACED sem position produz null/null; não se usa posição do jogador nem (0,0) como substituto. Um zero realmente fornecido continua zero. Campos parciais/inválidos são independentes e sinalizados. O histórico legado de wards e seu OpenAPI agora também admitem coordenadas nulas; clientes de heatmap devem ignorar localizações ausentes.
- Recaps `victimDamageDealt`/`victimDamageReceived` são opcionais. Cada entrada admite `magicDamage` (nome real), physicalDamage, trueDamage, participante, basic/name/spellName/spellSlot/type opcionais. `totalDamage` não é um total obrigatório nem sintetizado. DTOs não usam o nome inexistente magicalDamage.

`quality` registra unknownType, missingFields, invalidFields, sentinelFields, unresolvedParticipantIds e conflicts. Ausência opcional não torna todo evento inválido; consumidores escolhem os campos necessários à sua métrica. Esta qualidade é por evento/campo, não uma taxa global de cobertura nem garantia de validade de enums futuros. As contagens de eventos preservados e reconciliações dos testes não transformam wards de tipo UNDEFINED em wards reconhecidas.

## Persistência, rollback e rebuild

Migration: `20260923020000_met04_normalized_events`. O FK para Match usa cascade, portanto o rebuild offline remove a projeção junto da partida. Match, participantes, times, eventos, agregados e status COMPLETED são gravados na mesma transação sob o lease existente. `createMany` não ignora duplicatas: violação da identidade falha e reverte tudo, sem estado parcial publicado. Reentrega de um job concluído não contribui duas vezes; dois rebuilds reproduzem o mesmo conteúdo (exceto processedAt) e os mesmos agregados.

A migration é aditiva e não exige converter registros legados in-place. Em banco antigo a tabela começa vazia até o rebuild. Use o procedimento de manutenção de `PROCESSAMENTO-CONFIAVEL.md`; o ensaio conjunto de todas as novas projeções/migrations e restauração é o gate MET-09, não uma autorização de execução em produção.

## Exemplos e validação

Exemplo sintético: `{type:"BUILDING_KILL",killerId:0,teamId:200,timestamp:100}` vira actorParticipantId=null, actorPuuid=null, sourceTeamId=null, ownerTeamId=200, beneficiaryTeamId=100, mantendo zeros no payload. Com teamId=0, owner e beneficiário ficam null. `WARD_PLACED` sem position fornece positionX=null/positionY=null. Duas cópias do evento em índices diferentes geram duas linhas mesmo com timestamp igual.

`normalized-events.spec.ts` confere 1.966 payloads contra a fixture original, identidade, 18 famílias, 752 wards sem coordenadas, magicDamage, ausência versus lista vazia, sentinelas, desconhecidos, conflitos e integração com o parser legado. `normalized-event.dto.spec.ts` verifica o schema OpenAPI. `normalized-events.integration-spec.ts`, em PostgreSQL descartável serial, ensaia roundtrip real, reentrega, dois rebuilds, rollback atômico e eventos sintéticos futuros com mesmo timestamp. Integração é executada somente pelo coordenador durante sua reserva do banco compartilhado.

Evidências desta execução: `docs/analysis/met04-events-validation.json` (build, 280 unitários, 33 HTTP, 26 integrações, migration aplicada em banco descartável e dois rebuilds aprovados).
