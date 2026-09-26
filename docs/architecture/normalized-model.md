# Modelo normalizado de partidas — ARQ-03

O modelo canônico pertence a `modules/matches/contracts`: `normalized-match`, `normalized-timeline`, `normalized-events`, `normalized-snapshots`, `final-inventory` e `final-stats`. Esses contratos não importam worker, Prisma, Nest ou DTOs externos. Identidade, bigint de criação da partida, timestamps em milissegundos, unidades, ordem, campos ausentes e zeros observados mantêm sua representação.

O parser ainda é um adapter do payload Riot, a ser movido em ARQ-05. Seu retorno `ProcessedMatchData` já usa o contrato público de matches; consumidores do modelo deixam de importar o parser para obter esse tipo. Perks, challenges e pings possuem estruturas próprias no contrato. A persistência converte explicitamente os objetos do domínio para JSON em `core/prisma/json-value.ts`, sem casts do modelo para `Prisma.InputJsonValue`. A conversão preserva arrays e nulls e omite propriedades undefined, como o adapter anterior; bigint permanece na coluna apropriada, sem conversão para number.

Os arquivos antigos de projeção em `core/riot` conservam reexports nomeados de compatibilidade, sem segunda definição do modelo. Eles desaparecem quando os adapters migrarem, com remoção final conferida em ARQ-13.

## Instrumentação da transição

Extrair uma declaração antes de mover seu adapter cria imports físicos entre o caminho antigo e o novo contrato. O baseline de ARQ-02 usa caminhos para identificar violações; sozinho, ele classificaria a mesma dependência transferida como acoplamento novo e impediria a sequência ARQ-03 → ARQ-05 prevista pelo plano.

A instrumentação distingue essa transferência por um registro finito em `declaration-relocations.json`: origem Git, declaração anterior, contrato canônico, símbolos e consumidores exatos, proprietário e card de remoção. A identidade lógica anterior é usada somente nas regras de fronteira durante a transição. A análise de pureza usa sempre o destino real. O grafo físico e a dívida transitória continuam visíveis; imports novos, símbolos adicionais e mudanças de tipo para runtime não recebem essa compatibilidade automaticamente.

Esse refinamento implementa a compatibilidade temporária permitida no plano sem aumentar `violations-baseline.json` nem liberar diretórios inteiros. O modo estrito exige a remoção do registro transitório. Nenhuma alteração de fórmula, schema, rota, versão ou política de processamento faz parte dessa adaptação.

## Validação

Build e compilação isolada dos contratos; 617 testes unitários, 160 HTTP/OpenAPI e 54 integrações PostgreSQL/RabbitMQ. As integrações incluem round-trip das projeções, timestamps/nulos, atomicidade, redelivery e rebuild offline. A nova conversão JSON possui casos de zero/null, ordem dos frames, inteiros seguros e rejeição de valores não representáveis sem coerção silenciosa.
