# Plano de otimização da escrita de partidas

O objetivo é reduzir CPU, serialização e comandos SQL por partida, mantendo o schema atual e a publicação atômica. O alvo inicial é reproduzir na implementação definitiva o ganho do protótipo de escrita em lote: **86–88% mais partidas por segundo**, com os mesmos recursos, nas duas rodadas de 119 partidas. Esse resultado é uma referência experimental, não uma garantia de produção. Ver [relatório e condições de medição](report.md).

Plano elaborado em 13 de outubro de 2026 sobre o commit `413628a821370b39628ecb234cb3bc6490d0254e`. A implementação será dividida em mudanças revisáveis, cada uma acompanhada de comparação com o comportamento anterior. Este plano não altera os writers.

## Escopo e garantias

Manter NestJS, TypeScript, PostgreSQL, Prisma como gerenciador da transação e as tabelas atuais. Especializar o SQL nos adapters responsáveis pelas escritas volumosas. A normalização do dataset continua como evolução posterior, avaliada junto com seus leitores; seu ganho não entra na meta desta implementação.

O [ProcessingService](../../../src/modules/processing/services/processing.service.ts) continua sendo dono da transação. Os adapters recebem o `TransactionContext` existente e usam a mesma conexão: partida, projeções, contribuições, agregados e `COMPLETED` devem confirmar ou reverter juntos. Gate de manutenção, validação da lease, preservação dos brutos, lineage e comportamento de redelivery permanecem no fluxo.

SQL fica nos adapters, com valores parametrizados e colunas/tipos explícitos. A implementação definitiva não deve depender de introspecção DMMF, interceptação de métodos privados ou proxies usados na bancada. Não haverá uma biblioteca genérica de ORM ou outra transação dentro de um writer.

## Sequência de entregas

| Ordem | Entrega | Principal resultado esperado | Dependência |
| --- | --- | --- | --- |
| 1 | Preparar comparação e regressões | Referência reproduzível e critérios de correção | Corpus e scripts preservados |
| 2 | Especializar eventos e reduzir retorno da timeline | Menos trabalho de serialização no caminho mais volumoso | Entrega 1 |
| 3 | Agrupar incrementos de estatísticas | Aproximadamente três UPSERTs por partida em vez de cinquenta | Entrega 1; medir também com a entrega 2 |
| 4 | Resolver representação numérica e especializar dataset | Recuperar o restante do ganho do protótipo com mesmo schema | Diagnóstico numérico e entregas anteriores |
| 5 | Validar a composição real e liberar a mudança | Ganho sustentado com recuperação, consultas e export preservados | Writers candidatos concluídos |
| 6 | Ajustar concorrência por worker | Aproveitar a capacidade restante sem multiplicar processos desnecessariamente | Nova linha de base da entrega 5 |

As entregas 2 e 3 podem ser adotadas preservando o writer atual do dataset. Se a fidelidade numérica impedir a entrega 4, esses ganhos permanecem utilizáveis; o ganho total de 86–88% não será atribuído ao conjunto parcial sem medi-lo.

## Entrega 1 Preparar comparação e regressões

Usar os brutos congelados, com hashes conferidos, e um banco PostgreSQL exclusivo. Executar o mesmo coordenador nos caminhos original e candidato, mantendo durabilidade, CPUs, memória, pool e aquecimento iguais. Preservar resultados por commit e configuração para que seja possível atribuir cada ganho à mudança correta.

A comparação principal continua com as mesmas 119 partidas da auditoria. A partida rejeitada por ordem de participantes fica em um teste separado até a correção de identidade; não corrigir silenciosamente seus brutos nem mudar a população de uma única variante. A correção desse bug é uma entrega de domínio independente da otimização dos writers. Depois de corrigida, repetir ambos os caminhos sobre as mesmas 120 partidas.

Estender a bancada para executar os adapters definitivos e registrar duração de publicação, tempo dos writers, CPU por partida, memória, SQL executado, WAL, erros/retries e partidas completamente disponíveis. Separar espera por conexão e duração da transação quando instrumentadas; timers que incluem etapas internas não devem ser somados entre si.

Comparar as projeções e todas as contribuições por partida, além dos agregados. Manter duas leituras de validação: a aplicação pelo Prisma e a representação obtida diretamente pelo PostgreSQL. Timestamps operacionais e IDs substitutos podem ser excluídos conforme o contrato já documentado; IDs determinísticos, contagens, nulos, motivos de exclusão e proveniência permanecem na comparação.

**Aceitação:** a referência reproduz os resultados existentes, a bancada identifica diferenças reais e os casos de regressão estão ligados às garantias que cada writer deve preservar.

## Entrega 2 Eventos e timeline

Arquivo principal: [match-projection-writer.ts](../../../src/modules/matches/adapters/persistence/match-projection-writer.ts).

Restringir o retorno de `matchTimelineProjection.create` a `matchId`. O chamador descarta o objeto criado; devolver novamente `frames` transporta um JSON volumoso sem necessidade.

Substituir o `createMany` dos eventos por um INSERT parametrizado que expande registros JSON em colunas explicitamente tipadas. Preservar a identidade `(matchId, frameIndex, eventIndex)`, versões, timestamps, payload, qualidade e significado de campos ausentes. Não acrescentar `ON CONFLICT DO NOTHING`: um conflito inesperado deve continuar causando falha e rollback, em vez de esconder perda de eventos.

Tratar explicitamente SQL NULL, JSON null, listas vazias, datas e campos opcionais. Os sentinelas do Prisma, como `DbNull`, não devem ser serializados como objetos de domínio. Evitar reconverter o mesmo evento várias vezes. Se a preparação for extraída do writer, expor um contrato de dados sem Prisma e manter timestamp de conclusão e validação de lease no momento correto.

O lote precisa ter limite documentado de linhas ou bytes. Começar pelo caminho validado pelo protótipo e verificar o maior payload do corpus e casos maiores controlados; dividir em lotes limitados se necessário. Todas as partes continuam na mesma transação. Não escolher um tamanho arbitrário como otimização universal.

**Testes essenciais:** igualdade exata dos eventos e timeline no corpus; nulos e payloads opcionais; conflito de identidade; falha durante um lote posterior revertendo os anteriores; entrega repetida sem nova publicação. Reaproveitar os testes de processamento existentes.

**Aceitação:** projeções e dataset permanecem iguais, rollback funciona e há ganho repetível de processamento. O protótipo dessa combinação apresentou 30–36% mais capacidade; medir o adapter definitivo sem exigir que cada rodada repita exatamente essa porcentagem.

## Entrega 3 Agregados por tabela e chave

Arquivo principal: [player-stats-writer.ts](../../../src/modules/stats/adapters/persistence/player-stats-writer.ts).

Separar a construção dos incrementos da execução SQL dentro do módulo de estatísticas. Construir os deltas com as mesmas regras atuais e consolidar chaves repetidas antes de emitir um UPSERT com múltiplas linhas por tabela: `champion_stats`, `player_stats` e `player_champion_stats`. O protótipo interceptava um método privado; a implementação terá funções explícitas e tipadas.

Preservar escopos `ALL` e patch, separação de filas, contagens de vitória/derrota, amostras válidas de lane, somas, `roleDistribution`, semântica dos campos atualizados e `GREATEST(lastPlayedAt)`. Não misturar partidas diferentes em um acumulador global nem adiar seus agregados para depois do commit.

Definir uma ordem determinística de tabelas e chaves para aquisição de locks. A nova ordem difere da sequência intercalada do writer atual, então a validação deve incluir partidas com jogadores/campeões compartilhados. Não pressupor que writers antigos e novos podem coexistir sem contenção adicional durante uma atualização.

**Testes essenciais:** múltiplos incrementos para a mesma chave; concorrência entre partidas; preservação do histórico mais recente; distribuição de posições; rollback após os incrementos; redelivery após commit; duas reconstruções completas. Contagens inteiras precisam ser exatas. Diferenças nas somas de floats devem ser classificadas, distinguindo consolidação dentro da partida de mudanças na ordem concorrente; não aceitar a tolerância diagnóstica da auditoria como novo contrato.

**Aceitação:** aproximadamente três comandos de agregação por partida no caso normal, sem perda ou duplicação de incrementos, sem regressão de recuperação e com resultado numérico dentro do contrato definido. Medir o ganho dessa etapa separadamente e combinado com eventos.

## Entrega 4 Dataset com fidelidade numérica definida

Arquivo principal: [dataset-writer.adapter.ts](../../../src/modules/dataset/adapters/dataset-writer.adapter.ts).

### Diagnosticar a conversão antes de substituir o writer

Extrair casos mínimos das diferenças já registradas: valores inteiros representados como float, razões, somas e números aninhados em JSON. Comparar o valor preparado em JavaScript, o payload enviado, o valor armazenado e as leituras pelos dois caminhos. Para colunas `double precision`, comparar também sua representação binária no PostgreSQL; para JSONB, comparar a representação textual e os nulos. Isso separa transformação no envio, armazenamento e decodificação na leitura.

A primeira escolha é preservar o contrato atual. Não arredondar métricas nem mudar todas as colunas para `Decimal` para fazer a comparação passar. O problema identificado pode estar na conversão, e mudar tipos alteraria também semântica, consultas e custo.

Se não for viável preservar os valores atuais, registrar uma decisão explícita de representação: quais campos podem mudar, qual formato será canônico e como leitores, export e rebuild serão versionados juntos. O plano padrão mantém o writer atual até essa decisão; não mistura silenciosamente representações sob a mesma versão. As pequenas diferenças observadas no estudo não autorizam por si só a mudança.

### Substituir somente a persistência volumosa

Depois do diagnóstico, usar INSERT parametrizado por recordset com colunas e conversões explícitas. A primeira implementação pode conservar os lotes de até 500 contribuições já usados pelo adapter e medir se consolidá-los oferece benefício; reduzir chamadas não pode criar consumo de memória sem limite.

Preservar validação de pertencimento à partida/versão, IDs determinísticos, lineage fornecida pelo coordenador, `processedAt`, nulos e retorno da quantidade gravada. Manter a substituição das contribuições da partida dentro da mesma transação: o DELETE atual também remove definições retiradas. Otimizar para somente acrescentar linhas não preservaria esse contrato.

Cobrir `DatasetPersistenceAdapter`, `publishPreparedDataset` e os chamadores de `replaceHistoricalDataset`, para que o caminho offline continue compatível e sem implementações divergentes de persistência.

**Testes essenciais:** todas as contribuições do corpus; origem desconhecida e múltiplas observações de descoberta; definição retirada; lote vazio removendo linhas anteriores; falha após DELETE e após um lote; identificação de dados de outra partida/versão; rebuild interrompido e retomado; export com todos os splits previstos.

**Aceitação:** igualdade estrita segundo o contrato vigente, ou transição versionada definida e validada; ausência de linhas antigas; commit atômico. Um resultado apenas “dentro da tolerância diagnóstica” não aprova o writer. Se houver mudança de versão, o teste controlado existente serve de ponto de partida, não substitui a validação completa da transição real.

## Entrega 5 Validação integrada e liberação

Executar build, verificações de fronteiras e os testes unitários relacionados aos adapters. Executar as suítes de [processamento](../../../test/integration/processing.integration-spec.ts) e [dataset](../../../test/integration/dataset.integration-spec.ts) em PostgreSQL e RabbitMQ isolados. Acrescentar somente casos que exercitem os riscos novos: formatos SQL, lotes, consolidação de chaves e conversão numérica.

Validar lease expirada, entrega concorrente da mesma partida, redelivery após commit, falha depois dos agregados, recuperação, manutenção e rebuild. Essas garantias devem ser exercitadas com os adapters definitivos, não somente com os protótipos.

Repetir o replay nas configurações original, eventos, eventos mais agregados e conjunto completo. Usar pelo menos três rodadas com ordem alternada e o mesmo orçamento de recursos. Medir partida totalmente publicada por segundo, CPU por partida, memória, WAL e erros; comparar também consultas e export para detectar regressões de conteúdo ou representatividade dos dados.

Depois, executar carga sustentada de 30 minutos na composição real do worker, com RabbitMQ, brutos previamente disponíveis e leituras simultâneas representativas. Aumentar a taxa oferecida em degraus, registrando idade da fila, conclusão p95/p99, espera de banco, locks, memória e retries. O tempo e as cargas são parâmetros propostos para a nova validação; os números do estudo anterior não equivalem a esse ensaio.

**Critérios propostos:** contratos preservados; nenhum incremento perdido ou duplicado; nenhum crescimento contínuo de memória após aquecimento; nenhum novo padrão de deadlock/erro de lease; e ganho consistente na mediana das rodadas com os mesmos recursos. A referência de desempenho é cerca de 1,8–1,9 vez o baseline para o conjunto completo; ganho menor deve ser explicado por etapa antes da liberação. Percentuais isolados não compensam falha de correção.

Na atualização dos workers, pausar novas entregas e aguardar as transações em andamento, preservando os jobs duráveis e as leases existentes. Atualizar os processos e retomar o consumo; permitir coexistência de versões somente depois de testar suas ordens de locks. Para mudanças que preservam dados e versão, reverter o código restaura o writer anterior. Se a representação numérica for versionada, a reversão precisa considerar leitores e reconstrução: voltar apenas o binário pode ocultar dados ou misturar versões.

Não estão previstas migrations de schema nas entregas de escrita. Se o diagnóstico exigir uma, usar o gerador oficial ou timestamp real no momento da criação, conferir a ordem existente e preservar migrations já aplicadas.

## Entrega 6 Concorrência após otimizar os writers

Arquivos envolvidos: [main.ts](../../../src/main.ts), [worker.controller.ts](../../../src/modules/worker/worker.controller.ts) e configuração do pool.

Tornar configurável o limite de partidas simultâneas, iniciando com uma e comparando duas por worker. Verificar que o prefetch e o limite efetivo de execução atuem juntos, considerando os dois padrões de mensagem atendidos pelo controller. Dimensionar conexões para processamento, renovação de leases e operações de controle, sem simplesmente multiplicar o pool.

Repetir a comparação de dois processos com duas partidas simultâneas contra quatro processos com uma, agora com transporte, limites de container e composição reais. No estudo, os dois arranjos tiveram capacidade próxima, com menor soma dos picos RSS no primeiro; esse resultado motiva o teste, sem determinar antecipadamente a configuração de produção.

**Aceitação:** mais capacidade útil dentro do orçamento de CPU/memória, sem deterioração de estabilidade, renovação de leases ou shutdown. Manter uma partida por worker se a concorrência adicional não compensar. Registrar o ganho desta etapa separado do ganho do código.

## Resultado esperado e próximos limites

Ao concluir as entregas de escrita, o processamento terá adapters SQL específicos para eventos e dataset, incrementos agrupados e as garantias atuais de recuperação. O benchmark permitirá identificar quanto cada alteração contribuiu e qual recurso passou a limitar a capacidade.

A revisão estrutural do dataset e a otimização de seus leitores seguem como trabalho posterior. Se o perfil restante justificar outro driver, COPY ou preparação de CPU, compará-los contra esta nova linha de base. A decisão de adicionar workers passa então a considerar capacidade por recurso, idade da fila e saturação medida do banco, em vez de assumir que o ORM ou a máquina já chegaram ao limite.
