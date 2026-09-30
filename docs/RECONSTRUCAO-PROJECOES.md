# Reconstrução conjunta das projeções — MET-09

MET-03/04/05/06 formam a geração `PROCESSING_VERSION=2`: snapshots completos, eventos normalizados, estatísticas/contexto/objetivos finais e inventário final. Os números de versão individuais das projeções permanecem independentes (atualmente 1). MET-09 valida a integração dessa geração; não altera fórmulas nem cria uma terceira geração apenas para executar um ensaio.

O caso de uso de processing coordena a gravação da partida, times,
participantes/finais/inventário, snapshots, eventos, contribuições agregadas e
status `COMPLETED` na mesma transação, através das portas dos módulos donos.
A identidade dos eventos é `(matchId, frameIndex, eventIndex)`; a dos
participantes é `(matchId, puuid)`; há uma projeção de snapshots por partida.
Reentrega de `COMPLETED` não insere novas contribuições nem atualiza a geração:
dados antigos exigem rebuild explícito.

## Antes de migrar

O ensaio desta entrega ocorre somente em PostgreSQL descartável com nome terminado em `_integration`. Os comandos operacionais abaixo são um runbook, não registro de execução em produção.

1. Conservar backup verificável, MatchRaw e observações de descoberta. `processing -- coverage` descreve os pares brutos disponíveis, população e lacunas. `processing -- status` mostra trabalhos e manutenção. Uma partida COMPLETED sem os dois brutos impede o início do rebuild; não apagar essa partida para contornar a checagem.
2. Parar API, collectors e todos os workers. O marcador de manutenção bloqueia enqueue/claim/retry durante o rebuild, mas não torna consultas HTTP atomicamente visíveis em toda a base: a API deve permanecer parada até conclusão. Parar apenas o consumidor da fila é insuficiente. O rebuild usa a composição offline e não inicializa HTTP, cron, Redis, RabbitMQ ou cliente Riot.
3. Aplicar as migrations aditivas antes de executar o novo worker. Ordem do Prisma: `20260923020000_met04_normalized_events`, `20260923030000_met05`, `20260923040000_met06_final_inventory`, `20260923120000_met03_timeline_snapshots` (a migration de linhagem MET-18 também integra a árvore e é preservada).
4. Gerar o cliente Prisma e compilar o mesmo checkout que será usado na reconstrução. Conferir versão, banco alvo e resultado de cada comando; nenhum download Riot é necessário quando o par bruto existe.

```sh
npx prisma migrate deploy
npx prisma generate
npm run build
npm run processing -- status
npm run processing -- coverage
npm run processing -- rebuild
```

As migrations não sobrescrevem os campos legados nem o bruto. Finais/inventário/Riot ID novos ficam SQL NULL em registros existentes; tabelas de snapshots/eventos começam vazias. Essa ausência é distinta de contador zero e permanece explícita nos contratos de leitura até reconstrução. Não preencher colunas por inferência de séries legadas ou últimas compras.

## Interrupção, retomada e falha

O rebuild verifica os brutos antes de limpar projeções/agregados. A limpeza e o marcador de manutenção são atômicos. A trava de execução impede dois comandos concorrentes; cada partida reconstruída tem seu próprio commit. Se houver interrupção, os commits já COMPLETED ficam válidos e `rebuild --resume` processa apenas os restantes na mesma geração. A admissão normal continua bloqueada entre os comandos.

```sh
npm run processing -- status
npm run processing -- rebuild --resume
```

Não iniciar um rebuild novo para substituir `--resume`; não editar manualmente maintenance, status ou processingVersion. Uma falha após gravar projeções/agregados reverte a partida inteira; o bruto é mantido e o erro fica no trabalho. Corrigir a causa, manter a API parada e retomar. Trabalhos sem par bruto completo continuam pendentes para coleta posterior; isso não é cobertura completa. Execuções acima de uma hora precisam de retomada conforme o limite existente.

Após conclusão, conferir manutenção desativada, geração dos COMPLETED, contagens por partida, cobertura e reconciliação. Só então reativar os serviços. Ao voltar uma versão de aplicação, conservar colunas/tabelas novas e MatchRaw; não remover as migrations para simular rollback. Um rollback de código não restaura automaticamente a semântica de agregados reconstruídos: se necessário, restaurar um backup consistente ou reconstruir offline com a versão desejada, mantendo leitura desligada durante a troca.

## Ensaio reproduzível e limites

```sh
DATABASE_URL=postgresql://integration:integration@localhost:55439/high_br_integration npx prisma migrate deploy
TEST_DATABASE_URL=postgresql://integration:integration@localhost:55439/high_br_integration \
MET09_EVIDENCE_PATH=docs/analysis/met09-foundation-validation.json \
npm run test:integration -- --testPathPatterns=foundation.integration-spec.ts
```

A suíte limpa exclusivamente o banco isolado e exige reserva serial com outros testes de integração. O teste de migration copia linhas preenchidas para um schema temporário, remove somente as extensões novas dessa cópia e aplica os quatro arquivos SQL reais. Compara os campos preexistentes e bytes do bruto antes/depois; isso ensaia extensões em dados existentes, não recria cada versão histórica da aplicação. O schema temporário é removido ao fim.

Os testes de rebuild usam a fixture real BR1_3200579475 e duas cópias com IDs distintos explicitamente sintéticas. Conferem todas as oito tabelas de projeções/contribuições, removendo dos fingerprints somente IDs substitutos e timestamps de atualização/processamento; as identidades de negócio, valores, ordem dos arrays, precisão e ausência continuam na comparação. MatchRaw é comparado por bytes. A retomada também confere completedAt e a linha integral de evento do primeiro commit para demonstrar que ele não foi refeito.

O artefato [analysis/met09-foundation-validation.json](analysis/met09-foundation-validation.json) registra tempos locais, hashes, contagens, rollback/retomada e bytes de linhas PostgreSQL (`sum(pg_column_size(row))`, excluindo índices/espaço livre). O tempo é de parede local, com I/O e validações indicados; não representa throughput em produção. Há um patch real, uma fila e um mapa validados; cópias não ampliam diversidade do corpus. Não há execução em produção ou novo contrato HTTP nesta task. Os contratos/OpenAPI das projeções estão documentados nas tasks MET-03/04/05/06.

Validação em 23/09/2026: os três cenários conjuntos passaram. As quatro extensões levaram 101,0ms no schema local preenchido e preservaram os sete hashes legados. A reconstrução com interrupção/retomada levou 10,016s e a segunda reconstrução completa 9,854s (incluem conferências locais); hashes de projeções/agregados e bruto coincidiram. Duas cópias produziram 3.932 eventos/2.062.000 bytes de linhas e duas projeções de snapshots/219.228 bytes de linhas. Estes números são observações do ensaio, não orçamento de produção. O dev integrado também passou no build, 308 unitários e 66 HTTP.

Regressão integrada das quatro projeções: 6 suítes/37 testes PostgreSQL e RabbitMQ aprovados em 212,037s, incluindo o ensaio acima e os cenários anteriores de concorrência, reentrega e recuperação.

## Dataset histórico na geração 4 — MET19

A geração 4 acrescenta `historical_metric_contributions` ao mesmo commit de publicação. Aplicar a migration MET19 antes do rebuild; a FK com cascade remove o dataset anterior quando a reconstrução limpa partidas. Linhas da geração atual são substituídas integralmente, incluindo definições retiradas. Cálculos/JSON são preparados antes da transação; dentro dela, a gravação independente por partida antecede os upserts de agregados compartilhados, reduzindo a retenção desses locks sem relaxar atomicidade/timeout. O ensaio de `dataset.integration-spec.ts` verifica duas reconstruções, contagens/identidades/valores, rollback após a materialização e proveniência compartilhada com eventos e o job. `processing.integration-spec.ts` também compara o dataset no fingerprint de retomada/rebuild. Contrato, consulta e exportação em [DATASET-HISTORICO.md](DATASET-HISTORICO.md).
