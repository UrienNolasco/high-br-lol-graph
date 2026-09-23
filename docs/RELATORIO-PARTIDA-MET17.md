# Relatório navegável por jogador — MET-17

`GET /api/v1/matches/:matchId/report/:puuid` publica o relatório REST v1, `schemaVersion=1`. O resumo apresenta recursos, combate, visão e estruturas com `presentationWeight=1`: prioridade visual equivalente, sem soma ou nota geral. O consumidor navega pelos links retornados; não precisa conhecer tabelas para renderizar cartões, abrir métricas ou abrir eventos.

O cabeçalho identifica PUUID, Riot ID quando registrado, campeão, posição normalizada, time, resultado real, duração, mapa, fila e versão. Região histórica não registrada permanece `null`; não reutilizamos a região atual do usuário. Referência histórica permanece indisponível com `insufficient_sample`. MET-17 integra cálculos existentes; não cria benchmark, fórmula de eficácia ou validação de utilidade com jogadores.

## Rotas e navegação

Todas as rotas abaixo têm prefixo `/api/v1/matches/:matchId/report/:puuid`.

| Sufixo | Resultado |
| --- | --- |
| vazio | Resumo compacto, quatro dimensões, totais finais e links das famílias |
| `/metrics/:key` | Uma métrica com página de evidências |
| `/evidence/:id` | Campo observado/fonte ou campos selecionados de evento projetado |
| `/episodes` | Página de mortes do jogador, abates atribuídos ao jogador e objetivos da partida |
| `/episodes/:id` | Ocorrência e capturas temporalmente associadas, com links de eventos |
| `/families/:family` | Uma seção permitida, opcionalmente um detalhe indicado por `path` |

Exemplo de percurso: resumo → `dimensions[0].metrics[0].href` → `evidence.items[0].href`. Outro: episódios filtrados por morte → `items[0].href` → `events.items[0].href`. Eventos usam identidade `matchId:frameIndex:eventIndex`; o prefixo `event:` distingue detalhes de evento. Métricas usam família e caminho codificado; evidências de campo usam família e hash determinístico do conteúdo. Identidades são estáveis para a mesma projeção; uma reconstrução que altere o campo pode invalidar seu hash anterior com 404. Não existe token de snapshot entre requisições.

`mode` acompanha links de métricas, evidências e páginas; `nearest` nunca passa silenciosamente a `pastOnly`. Uma evidência baseada em frames informa frame, campo e instante efetivamente utilizados. Evidências de evento oferecem `eventHref` quando aplicável. O detalhe de evento mantém autor, vítima, time fonte, dono e beneficiário separados; coordenada incompleta fica nula. Payload bruto não é enviado. Campos textuais acima de 200 caracteres são limitados e listados em `fieldLimits.truncatedFields`.

## Famílias e seções permitidas

| Família | Seções |
| --- | --- |
| contribution | resources, combat, vision, structures |
| economy | checkpoints, samples, intervals, phases, unspentGold, finalResources |
| vision | metrics, byType, phases, gaps, objectiveWindows, reconciliation |
| objectives | chronology, finalTotals, reconciliation, participantContributions, structures, plates |
| combat | participant, killerVictimMatrix, coParticipation |
| sequences | deathEpisodes, deathRates, killEpisodes, killRates, goldChanges, temporalTrades, comeback |
| progression | inventory, acquisitions, transitions, itemTimings, skills, reconciliation |

A seção padrão é a primeira de cada linha. O resumo não embute essas famílias. Os cálculos são os de [contribuição](CONTRIBUICAO-INDIVIDUAL.md), [economia](ECONOMIA-E-PROGRESSAO.md), [combate](COMBATE-MET13.md), [objetivos](OBJETIVOS-E-ESTRUTURAS.md), [sequências](SEQUENCIAS-E-VIRADAS.md) e [progressão](PROGRESSAO-ITENS-HABILIDADES-MET16.md), incluindo visão MET-11. ID de oportunidade, versão, origem, método, valor/unidade, denominador, cobertura e evidências são preservados. Em valores econômicos, a janela original também é expressa pelo checkpoint/intervalo externo; `window=null` no envelope individual significa que essa família não forneceu uma janela no valor escalar, e a evidência conserva o instante real. O parâmetro de modo permanece no link.

Seções de combate selecionam o jogador e suas relações. Mortes são do jogador; episódios de abate são do autor do abate; taxas de captura após abate da família sequences usam o time conforme a definição O05. Objetivos e viradas conservam contexto da partida. A unidade do episódio de morte é uma ocorrência; duas capturas não a multiplicam. `(morte,morte+60s]` é associação temporal, sem inferir culpa, intenção ou causalidade.

## Limites, filtros e disponibilidade

- `limit`: inteiro 1–50, padrão 10; `offset`: 0–50000, padrão 0.
- `evidenceLimit`: inteiro 0–20, padrão 3, controla apenas o preview.
- `fromMs` e `toMs`: inteiros 0–86400000, intervalo de apresentação `[fromMs,toMs)`, com início estritamente menor que fim quando ambos informados. Itens sem timestamp próprio/identificável continuam visíveis; o filtro não inventa instantes.
- `kind`: death, kill ou objective para episódios. `mode`: pastOnly (padrão) ou nearest para checkpoints.
- `section`: allowlist acima; `path`: propriedades próprias indicadas pelos links, até 16 segmentos e 512 caracteres; protótipos e caminhos malformados são rejeitados.

Coleções retornam `{items,total,offset,limit,hasMore,next}`. `total` conta itens após o filtro de apresentação, sem alterar os denominadores nem as janelas dos cálculos. Arrays aninhados têm preview de até 3 itens; seus links abrem o array completo paginado, preservando índices originais. Profundidade de resumo é limitada a 8 níveis, com link de detalhe. Texto de seção acima de 2000 caracteres retorna wrapper com `truncated`, tamanho original e motivo. Não há truncamento silencioso das coleções de evidência. `evidenceLimit=0` mantém `total` e link para a primeira página.

400 distingue limites, modos, intervalos e família/seção/caminho inválidos. 404 distingue partida/jogador ou detalhe não encontrado. Estados parciais e métricas indisponíveis usam 200 com razões, `value=null`, nunca zero fabricado. Zero observado continua válido; share com denominador zero permanece indisponível.

`availability` separa processamento, eventos e frames. A disponibilidade das famílias no resumo indica pré-requisitos das projeções; a rota da família apresenta sua cobertura e razões específicas, e o catálogo pode estar indisponível apesar de eventos presentes. Totais finais observados continuam legíveis sem timeline. Sem job COMPLETED, geração >=2 e data válida, as métricas derivadas não são publicadas como processadas: versão/data ficam nulas e há motivo explícito. Os totais literais usam um envelope de observação do relatório que admite proveniência nula; não fabricam um `MetricResult` processado. Geração legada usa `unsupported_processing_version`; tipos/versões de projeção incompatíveis mantêm motivos da família. Ausência de episódios por falta de projeção é diferente de uma análise válida sem ocorrências.

## Leitura e compatibilidade

Cada requisição lê uma única partida, participantes/times, projeção de frames, eventos e job em transação `RepeatableRead`. Cálculos compartilham esse snapshot e são executados sob demanda. Não há chamada aos serviços de famílias que abririam leituras independentes. O GET não lê `MatchRaw`, não descomprime JSON bruto, não chama Riot e não aquece CDN: somente `getCachedItemCatalog` e `getCachedSkillCatalog`. Cache frio produz ausência de catálogo explícita.

A consulta busca no máximo 10001 eventos para detectar o limite de 10000. `eventRows=10001` com truncamento é um limite inferior, não o total global. Famílias dependentes de eventos ficam indisponíveis ao exceder esse limite. Frames são um único JSON da partida; até 300 são aceitos para cálculo, acima disso `framesTruncated` impede seu uso e expõe motivo. A leitura desse JSON não tem corte no banco; o limite protege cálculo/publicação, não elimina seu custo de transferência. MET-33 mede custo e latência com esse contrato; estes limites não são uma alegação de orçamento de produção já aprovado.

Não há alteração de schema, migration nem nova reconstrução de dados. É uma rota aditiva: contratos e cálculos das rotas anteriores continuam preservados. Famílias MET-24/25 e demais explorações não são embutidas neste relatório. Os payloads antigos do protótipo MET-34 continuam como proposta de revisão, e os links publicados aqui são o contrato de consumo implementado.

## Exemplos e validação

[Exemplos executáveis e tamanhos](analysis/met17-report-examples.json) incluem Fiora e Milio, episódios e variantes de ausência. Valores vêm da fixture real de 41 frames; geração/data de processamento do exemplo são **sintéticas**, identificadas no artefato, sem alegar um job histórico real. O teste PostgreSQL usa a data real do processamento feito no banco descartável. Reproduzir o artefato com `npx ts-node scripts/audit-match-report.ts`.

As contribuições reconciliam Fiora (ouro do time 28,0613%, cura 2877, escudo zero observado) e Milio (cura 13741, escudos 19049, 46 wards). O episódio de Fiora perto de 19:58 tem uma morte e duas capturas: torre e Barão. Testes unitários cobrem os sete adapters, identidade/paginação, gerações legadas, truncamento e ausência. HTTP usa o `MatchesModule` real e valida OpenAPI, 400/404, parcial/indisponível e percurso nearest → métrica → evidência. PostgreSQL reconstrói a fixture, remove o bruto e percorre as rotas de serviço, depois remove as projeções temporais e a data do job para comprovar preservação dos totais e ausência explícita.

Esta entrega não registra teste de usabilidade, retenção ou melhora do jogador. O roteiro MET-34 permanece sem participantes reais.
