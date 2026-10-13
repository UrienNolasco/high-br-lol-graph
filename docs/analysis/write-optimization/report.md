# Otimização da escrita — implementação e validação

Implementação do [plano de escrita](../architecture-study/write-optimization-plan.md), sobre o commit `54cfb3e45a45c2b475bbb20f4ca304bda41d2912`. Os resultados abaixo comparam o código anterior preservado em um build separado com os adapters definitivos. A aquisição pela Riot fica fora do ensaio: os brutos já estão disponíveis no PostgreSQL.

## Resultado do replay

**O ganho de capacidade foi de 70%, 76% e 129% nas três comparações pareadas; a mediana dos ganhos é 76%.** A mediana das reduções pareadas de CPU do Node por partida é **61%**. Todas as rodadas usaram as mesmas 119 partidas, dois processos com uma partida simultânea cada, afinidade de CPU igual, pool de três conexões por processo e PostgreSQL durável com duas CPUs e 2 GiB.

| Caminho de escrita | Rodada 1, partidas/s | Rodada 2, partidas/s | Rodada 3, partidas/s | Mediana do ganho pareado sobre o anterior |
| --- | ---: | ---: | ---: | ---: |
| Código anterior | 0,749 | 0,922 | 0,793 | referência |
| Eventos em lote + retorno reduzido da timeline | 1,100 | 1,172 | 0,902 | 27% |
| Eventos + agregados agrupados | 1,189 | 1,191 | 1,070 | 35% |
| Eventos + agregados + dataset em lote | 1,713 | 1,621 | 1,345 | 76% |

A ordem foi anterior → eventos → agregados → completo nas rodadas 1 e 3, e invertida na rodada 2. Os valores variaram em uma máquina compartilhada; outras atividades, incluindo verificações em CPUs diferentes, impedem tratar o ensaio como laboratório exclusivo. A comparação pareada é o resultado principal. Dividir as medianas separadas das taxas produz 104%, uma estatística diferente que não deve ser confundida com a mediana dos ganhos por rodada. Não há estimativa de intervalo de confiança ou promessa de capacidade em produção.

A soma dos picos RSS individuais dos dois processos teve mediana de 980 MiB no caminho anterior e 719 MiB no completo. Essa soma é um limite superior dos picos individuais, não uma medição de pico simultâneo. A redução principal está na preparação/serialização das escritas pelo Prisma/Node. O volume de WAL por partida permanece semelhante, pois as tabelas, os índices e o conteúdo persistido foram preservados.

Na terceira rodada, os agregados executaram **119 UPSERTs por tabela**, totalizando **3 por partida**, contra 50 no writer anterior. Os eventos usaram 209 inserts para 119 partidas; o dataset, 238. A compatibilidade numérica acrescentou 238 consultas pequenas, com aproximadamente 35 ms de execução SQL somada no PostgreSQL. Esse tempo não inclui o custo de serialização e transporte do cliente.

A referência experimental de 86–88% do plano não é uma garantia da implementação definitiva. Agora há lotes limitados, preservação estrita da representação numérica e tratamento explícito dos nulos. As etapas foram medidas separadamente: eventos e timeline entregam o primeiro ganho, os agregados acrescentam redução de chamadas, e o dataset remove outra parcela grande de CPU do cliente. A variação observada não permite atribuir uma diferença de poucos pontos percentuais em relação ao protótipo a uma única causa.

Dados: [resumo calculado](summary.json), [referência da terceira rodada](baseline-3.json), [implementação completa da terceira rodada](full-3.json). Os arquivos de cada rodada registram hashes dos writers compilados, configurações, contagens, CPU, memória, WAL e amostras de latência.

## O que mudou

### Eventos e timeline

O [writer de projeções](../../../src/modules/matches/adapters/persistence/match-projection-writer.ts) solicita somente `matchId` ao criar a timeline. O objeto `frames` continuava sendo devolvido pelo Prisma, embora o chamador descartasse esse retorno.

O [writer de eventos](../../../src/modules/matches/adapters/persistence/event-recordset.ts) grava registros JSON em colunas explicitamente tipadas com `jsonb_to_recordset`. Cada comando contém no máximo 1.000 eventos. O timestamp de publicação é um parâmetro compartilhado pelo lote. Identidades conflitantes continuam causando erro e rollback. O limite controla a quantidade de linhas e objetos temporários; não representa um limite de bytes de um payload individual.

### Agregados

O [writer de estatísticas](../../../src/modules/stats/adapters/persistence/player-stats-writer.ts) prepara os deltas e os publica por tabela, ordenando as chaves para aquisição dos locks. No caso normal, executa um UPSERT para campeões, um para jogadores e um para jogador/campeão.

Há uma decisão importante em relação à ideia inicial de consolidar chaves repetidas: **incrementos para a mesma chave permanecem em lotes sucessivos**. Somar os deltas em JavaScript antes de adicioná-los ao agregado existente mudaria a ordem das operações com floats. O comportamento escolhido mantém essa ordem dentro da partida, incluindo adição a históricos já existentes. Casos com chaves repetidas podem executar mais de três comandos.

As regras de patch/`ALL`, fila, amostras de lane, distribuição de posições, primeiro nome inserido e `GREATEST(lastPlayedAt)` são preservadas. Partidas diferentes continuam publicando seus agregados dentro de suas próprias transações.

### Dataset e representação numérica

O [writer do dataset](../../../src/modules/dataset/adapters/dataset-recordset.ts) mantém lotes de até 500 contribuições, com lineage e `processedAt` compartilhados como parâmetros do comando. A substituição continua fazendo DELETE e INSERT na mesma transação, removendo também contribuições de definições retiradas. As verificações de pertencimento à partida e versão permanecem no adapter.

O diagnóstico identificou que o caminho de parâmetros numéricos do Prisma pode mudar um float em uma unidade de precisão. Por exemplo, um dos casos preparados como `20.878599053443008` era armazenado pelo caminho anterior como `20.87859905344301`. Enviar diretamente o primeiro valor dentro de uma string JSON alterava o conteúdo persistido.

O [helper de compatibilidade](../../../src/core/prisma/recordset-json.ts) passa os números distintos que não são inteiros seguros pelo mesmo caminho de parâmetros do Prisma, em um array de `double precision`. A resposta vem como texto JSON, evitando uma segunda conversão pelo decoder de floats dos resultados. Esses valores são usados na serialização do lote. Números não finitos são rejeitados. O procedimento preserva o contrato existente; não introduz arredondamento de métricas ou mudança para `Decimal`.

O dataset distingue SQL NULL de JSON null. Isso precisa ser explícito porque `jsonb_to_recordset` também converte um null JSON de campo em SQL NULL. `quality` e `evidence` preservam JSON null; `denominator` usa um marcador separado para conservar a diferença entre `Prisma.DbNull` e `Prisma.JsonNull`.

Evidências iniciais: [diagnóstico numérico](float-diagnostic.json) e [piloto de equivalência](float-compatibility-pilot.json). A atualização do Prisma deve repetir os testes diferenciais contra `createMany`, incluindo números aninhados em JSON.

### Concorrência e encerramento

`WORKER_CONCURRENCY` configura tanto o prefetch do RabbitMQ quanto o limite efetivo de execuções no controller. Aceita inteiros de 1 a 16 e tem padrão **1**. Os padrões `match.collect` e `user.update` compartilham o mesmo limite. O controle local também mantém o limite quando há handlers antigos em andamento durante uma reconexão do transporte.

No encerramento, o controller cancela o consumo conhecido, aguarda os trabalhos aceitos e seus ACKs, e então permite que o Nest finalize as dependências. Canais encerrados são retirados do registro de consumidores. O Compose recebe a variável e um período de encerramento de 60 segundos para ambos os workers.

O teste com a aplicação completa revelou dois problemas adicionais. O bootstrap usava `app.get(PinoLogger)` para um provider de escopo transitório, provocando `InvalidClassScopeException`; agora usa `app.resolve(PinoLogger)`. A recuperação periódica podia continuar publicando depois do fechamento da conexão RabbitMQ, acumulando timeouts durante o shutdown. Agora ela interrompe o restante do lote, aguarda a publicação corrente e deixa os jobs ainda não enviados disponíveis para recuperação durável. O fechamento da conexão ocorre em `beforeApplicationShutdown`, depois dessa drenagem. Um teste da ordem real dos hooks do Nest cobre publicação → encerramento do Prisma → fechamento da conexão de publicação.

A transação continua pertencendo ao `ProcessingService`: projeções, dataset, agregados e `COMPLETED` confirmam ou revertem juntos. O schema, as versões de processamento/dataset, NestJS e Prisma são mantidos. Esta entrega não cria migrations.

## Verificação final

### Conteúdo, transações e reconstrução

A [comparação integral](equivalence.json) entre a terceira rodada anterior e a implementação definitiva encontrou igualdade estrita em 119 partidas, 238 equipes, 1.190 participantes, 119 timelines, **131.203 eventos e 104.363 contribuições**. Eventos e contribuições também foram comparados na representação textual obtida diretamente do PostgreSQL: nenhuma diferença. Foram excluídos somente timestamps operacionais e IDs substitutos previstos no contrato da bancada.

Nos agregados do replay concorrente, apareceram 23 diferenças de ponto flutuante, com diferença absoluta máxima de aproximadamente `9,09e-12`, sem diferenças em contagens ou outros campos. Para separar conversão de mudança na ordem das partidas, foi executada uma [comparação com ordem idêntica](stats-equivalence.json): 119 partidas em ordem direta e novamente em ordem inversa, adicionando a históricos existentes. As 458 linhas de campeões, 1.288 de jogadores e 2.005 de jogador/campeão ficaram estritamente iguais. Não foi introduzida tolerância como contrato dos writers.

As quatro consultas reais da comparação terminaram com sucesso. A consulta ampla por fila/patch permaneceu lenta, aproximadamente 9,4 s antes e 9,1 s depois; otimizar escrita não resolve esse leitor. Duas consultas apresentaram pequenas diferenças nas somas de floats, sem alteração nas linhas armazenadas. O [diagnóstico de ordem das agregações](read-aggregation-order.json) encontrou igualdade estrita nos 125 grupos ao fixar a ordem de entrada do `SUM`; inverter essa ordem dentro do próprio banco anterior também reproduziu diferenças. As consultas atuais não garantem essa ordem.

Os cinco arquivos do export tiveram o mesmo conteúdo lógico: quatro também ficaram idênticos em bytes; os metadados diferiram apenas no timestamp operacional. A [reconstrução](rebuild.json), sobre cinco partidas reais, preservou o conteúdo após interrupção/retomada e após uma segunda execução completa.

Passaram **716 testes unitários em 126 suítes**, **43 testes de integração** de processamento, dataset e novos lotes, além de seis casos de recuperação/publicação novamente executados após o ajuste do encerramento. Os novos testes cobrem SQL NULL versus JSON null, representação de floats, conflito em lote posterior revertendo os anteriores, DELETE revertido, lote vazio, dados de outra partida e incrementos repetidos para a mesma chave.

Build e lint dos arquivos alterados passaram. Os 63 testes do verificador de arquitetura passaram. O comando `architecture:check` continua reprovando por **27 violações preexistentes nos scripts do estudo anterior**; a [comparação com o commit de referência](architecture-delta.json) não encontrou violações acrescentadas. Essas pendências não foram incorporadas ao baseline para ocultar a reprovação.

### Workers reais e concorrência

Os ensaios executaram `dist/main.js`, `AppModule`, transporte RMQ, PostgreSQL e Redis reais, usando a imagem de bancada Node 26.11.1. Os workers receberam **duas CPUs e 2 GiB no total**: duas instâncias com 1 GiB cada ou quatro com 512 MiB cada. O PostgreSQL recebeu outras duas CPUs e 2 GiB. O pool ficou em três conexões por processo; portanto quatro processos também têm mais conexões totais.

| Configuração | Partidas/s nas rodadas curtas | Erros |
| --- | ---: | ---: |
| 2 workers × concorrência 1 | 2,282 | 0 |
| 2 workers × concorrência 2 | 2,991 e 2,895 | 0 |
| 4 workers × concorrência 1 | 2,702 e 2,457 | 0 |

Cada rodada ofereceu 119 IDs, dos quais quatro já tinham sido processados no aquecimento e foram reenviados para exercitar idempotência. A taxa conta somente as 115 novas conclusões. Os dois arranjos com quatro execuções simultâneas foram repetidos em ordem alternada. Duas instâncias com concorrência 2 foram mais rápidas nas duas comparações e evitam duplicar o número de processos. A configuração 2 × 1 tem apenas uma rodada e serve de referência exploratória.

A soma dos picos RSS amostrados ficou em **485–489 MiB** com 2 × 2 e **811–818 MiB** com 4 × 1. São picos individuais amostrados, não o pico físico simultâneo do conjunto. O [resumo dos containers](real-summary.json) também registra a memória dos cgroups separadamente.

As taxas absolutas desta bancada não devem ser combinadas com as do replay dos writers: há diferenças de runtime, composição, distribuição das entregas, aquecimento e carga oferecida. O ganho de concorrência também não deve ser multiplicado pelo ganho de código para prometer uma capacidade de produção.

Uma primeira execução desta bancada foi descartada: jobs pré-carregados estavam imediatamente elegíveis, e o recuperador real os publicava antes da chegada programada. A bancada corrigida mantém os placeholders com `nextAttemptAt` futuro e ativa cada job na chegada, aguardando confirmação do broker e registrando `publishedAt`. A recuperação continua habilitada. Uma asserção impede aceitar conclusões anteriores à oferta. Todos os resultados da tabela foram repetidos depois dessa correção.

### Carga sustentada

O [ensaio de 30 minutos](soak-30m.json) usou dois workers com concorrência 2, pool de três conexões por worker e uma API separada com uma CPU adicional. Ofereceu 2.700 IDs, repetindo as 119 partidas do corpus com IDs novos e jogadores compartilhados. Isso cria histórico crescente e contenção de agregados, mas não representa 2.700 partidas estatisticamente independentes.

**As 2.700 partidas terminaram como `COMPLETED`, todas na primeira tentativa.** Foram conferidas 2.367.900 contribuições, 27.000 jogos nos agregados de campeões e 27.000 nos agregados `ALL` dos jogadores. Os quatro IDs processados no aquecimento foram reenviados sem duplicar essas contagens. Houve 2.696 novas conclusões durante a janela medida, zero erros registrados e zero falhas entre as 156 consultas HTTP.

| Chegadas oferecidas | Duração | Novas conclusões | Conclusão p95 / p99 | Consulta HTTP p95 | Maior fila pronta amostrada |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 partida/s | 10 min | 596 | 1,152 / 1,255 s | 0,608 s | 0 |
| 1,5 partida/s | 10 min | 900 | 1,366 / 1,820 s | 3,306 s | 0 |
| 2 partidas/s | 10 min | 1.200 | 3,856 / 6,450 s | 9,099 s | 8 |

Conclusão mede o intervalo entre oferta e publicação concluída, incluindo espera. Os estágios classificam as partidas pelo instante da oferta; uma leitura iniciada durante a drenagem aparece somente no total global. Os percentis globais de conclusão foram 2,275 s no p95 e 5,522 s no p99, com máximo de 7,313 s. A fila terminou vazia cerca de **um segundo após os 30 minutos**. A idade máxima amostrada de um job oferecido ainda não concluído foi 5,641 s. Houve no máximo um backend esperando lock nas amostras, sem deadlock ou retry observado.

Na etapa final, o PostgreSQL usou em média aproximadamente **63% de suas duas CPUs**, e os workers aproximadamente **46% de suas duas CPUs somadas**. Esses números não incluem a CPU da API no orçamento dos workers. Não há instrumentação individual de espera pelo pool; locks e fila são amostrados a cada dez segundos e podem omitir esperas breves. O ensaio comprova sustentação das taxas oferecidas, não saturação máxima do hardware.

O pico RSS amostrado ficou abaixo de 274 MiB por worker, com pico de memória do cgroup abaixo de 217 MiB por worker. São medidas diferentes e não devem ser somadas entre si. Nas cinco janelas de dois minutos da etapa final, as medianas de heap ficaram entre 54,8 e 61,3 MiB, com quedas entre janelas e sem crescimento monotônico. O RSS se acomodou em patamares um pouco maiores conforme a taxa subiu; não apareceu crescimento contínuo nas janelas finais. Trinta minutos não excluem vazamentos de evolução mais lenta. O cgroup do PostgreSQL ficou próximo de 2 GiB, incluindo cache de arquivos; esse contador sozinho não diagnostica vazamento de memória.

O teste de SIGTERM enviou uma partida extra, fora das métricas acima, e encerrou o container que a estava processando. Ele concluiu a partida na primeira tentativa e saiu normalmente em **1,52 segundo**. O outro worker e a API também encerraram normalmente. Os jobs recuperáveis continuaram seguindo o protocolo durável existente.

**A principal ressalva é a leitura com histórico crescente.** As consultas alternaram filtros por campeão/posição e jogador/métrica. Todas retornaram HTTP 200, mas a latência piorou: p95 de 9,099 s e máximo de 13,417 s no último estágio. A taxa de escrita, o tamanho do histórico e a pressão de cache cresceram juntos, portanto este ensaio não isola a contribuição de cada fator. O resultado não homologa um objetivo de baixa latência da API. Otimizar os leitores e avaliar seu comportamento com históricos maiores permanece uma entrega separada.

Os dados por estágio, memória, CPU, encerramento e comparações de containers estão no [resumo calculado](real-summary.json). Os comandos estão no [guia de reprodução](../../../scripts/write-optimization/README.md), e as verificações finais e hashes em [checks.json](checks.json).

## Condições de adoção

Para atualizar os workers, suspender novas entregas, drenar as transações em andamento e substituir os processos. A coexistência de writers antigos e novos tem ordens diferentes de aquisição de locks e não foi homologada como estratégia de atualização gradual.

O encerramento real é validado com `node dist/main.js`. Wrappers de desenvolvimento com hot reload precisam encaminhar SIGTERM ao processo da aplicação; apenas aumentar `stop_grace_period` não estabelece esse encaminhamento.

O padrão de concorrência continua em uma partida por worker. Para o perfil validado, a recomendação é **dois workers com `WORKER_CONCURRENCY=2` e pool de três conexões por worker**, acompanhando idade da fila e latência da API. A variável já está disponível no Compose; o `.env` da aplicação não foi alterado. Mais concorrência não é automaticamente melhor: é necessário deixar conexões para renovação de leases e operações de controle. O ganho dessa configuração é separado do ganho dos writers.

Como schema e versões foram preservados, reverter o código restaura os writers anteriores sem conversão dos dados. Os testes de equivalência são a condição para essa compatibilidade.

A partida `BR1_3283642155`, rejeitada pelo problema de identidade já documentado no estudo anterior, permanece excluída dos dois caminhos. Seus brutos não foram corrigidos. Os [240 arquivos do corpus tiveram seus hashes conferidos](corpus-integrity.json). Resolver esse problema de domínio e repetir a comparação sobre as 120 partidas continua sendo uma entrega independente.

## Próximo limite a investigar

Esta implementação reduz o custo comprovado de serialização e comandos da escrita, preservando as tabelas e a transação. Ela não demonstra que todas as possibilidades de otimização em código foram esgotadas. O próximo trabalho justificado pelos dados é melhorar as consultas do dataset e repetir degraus acima de duas partidas/s, com histórico e objetivo de latência definidos, instrumentando espera por conexão e I/O. Só essa medição permitirá decidir se a próxima unidade de capacidade deve vir de outro worker, mais recursos para o PostgreSQL ou outra redução de custo por partida.
