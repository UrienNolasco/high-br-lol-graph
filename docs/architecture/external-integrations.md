# Integrações externas e normalização

ARQ-05 separa o transporte externo do modelo de partida.

`core/riot` conserva HTTP, DTOs recebidos da Riot, rate limiting e retry
técnico. O cliente retorna observações de rank no seu próprio DTO; a coleta as
converte em contexto de descoberta. A extração técnica de status HTTP é
independente da decisão de retry de um job. Timeline 404 continua significando
ausência; as demais falhas continuam sendo propagadas.

`modules/matches/adapters/riot` converte os dados recebidos em partidas,
participantes, eventos e snapshots normalizados. O parser recebe explicitamente
a geração de processamento. A montagem do worker fornece o parser; obter um
cliente HTTP Riot não registra parsers como efeito colateral.

As leituras de envelopes normalizados pertencem aos contratos de matches:
`snapshot-readers.ts`, `final-inventory.ts` e `participant-display.ts`. Elas não
dependem de DTOs Riot, clientes de rede, Nest ou Prisma. DTOs Swagger dos eventos
e snapshots ficam em `modules/matches/dto`.

A divisão preserva identidade e ordem dos frames/eventos, timestamps, campos
desconhecidos, precisão numérica, diferenças entre ausência e zero, semântica do
inventário final e o comportamento explicitamente limitado dos gráficos legados.
As verificações que cruzam normalização e analytics ficam na integração de
snapshots, incluindo a leitura após persistência em PostgreSQL.

Os caminhos usados pelo estudo para calcular hashes de implementação acompanham
os arquivos movidos. Essa mudança de proveniência não representa nova versão dos
dados nem alteração de features ou de protocolo experimental.

Data Dragon expõe fontes técnicas e mantém versionamento, transporte, cache e
coalescimento de requisições. O adapter em matches converte essas fontes em
`contracts/catalogs.ts`. `CatalogReader` oferece somente consultas ao cache;
`ItemCatalogLoader` conserva o preload existente de Builds. Report e Progression
não iniciam acesso à rede. O adapter memoiza a conversão por identidade da fonte,
para não reconstruir catálogos inteiros a cada leitura.

Os catálogos válidos continuam com TTL de uma hora; resultados indisponíveis ou
inválidos, um minuto. Itens sem imagem continuam válidos com URL ausente, entradas
malformadas são ignoradas como antes, e campeão ausente permanece distinto de
schema de skills inválido. Testes existentes e regressões dessas fronteiras
acompanham o transporte e o adapter, preservando a cobertura de champions.

A comparação de projeções executa os sete reconciliadores antes e depois da
extração e confronta oito saídas JSON. A evidência está em
`evidence/arq05-projection-equivalence.json`. Para reproduzir, execute
`evidence/compare-projection-corpus.cjs` a partir de cada checkout compilado,
com `ARQ_CORPUS_OUTPUT` apontando para uma pasta temporária; na segunda execução,
configure também `ARQ_CORPUS_BASELINE` com a pasta gerada pela primeira.
Somente o tempo de execução `calculationMs` é excluído da igualdade semântica.
