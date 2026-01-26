# Master Plan: Histórico Completo de Partidas (Data Warehouse)

## 1. Visão Geral e Objetivo

Atualmente, nosso sistema descarta os dados brutos da partida após calcular estatísticas simples. Isso impede a criação de telas detalhadas no App Mobile (ex: ver build, ordem de skills, pings).
O objetivo desta feature é migrar para uma arquitetura de **Data Warehouse**, onde armazenamos a fidelidade total do JSON da Riot (Match-V5) em um banco relacional estruturado, permitindo consultas complexas futuras e servindo de **Fonte Única da Verdade**.

## 2. Decisões Arquiteturais (Backend Only)

- **Single Source of Truth:** A tabela `ChampionStats` (agregada) deixará de ser populada diretamente pelo JSON. Ela passará a ser uma **projeção derivada** dos dados salvos nas tabelas brutas.
- **Pipeline ETLA:** Implementaremos um fluxo estrito de _Extract -> Transform -> Load -> Aggregate_.
- **Mobile-First Data:** O schema do banco deve priorizar campos que alimentam a UI do mobile (Runas, Challenges para Badges, Pings para comportamento).

## 3. Etapas de Implementação (Roadmap)

### Fase 1: Fundação (Database)

- Criar tabelas `Match` (Metadata), `MatchTeam` (Objetivos/Bans) e `MatchParticipant` (Dados do Jogador).
- Configurar colunas `JSONB` para dados de alta variabilidade (Challenges, Pings, Runas).
- Criar índices estratégicos (`puuid`, `championId`, `queueId`) para garantir resposta <100ms na API.

### Fase 2: O Processador (Worker V2)

- **Mapper:** Criar utilitário que converte o DTO da Riot (aninhado e complexo) para o formato plano/relacional do Prisma.
  - _Desafio:_ Extrair pings que vêm soltos na raiz do objeto.
  - _Desafio:_ Converter listas de itens (`item0`...`item6`) para arrays de inteiros.
- **Transaction:** Implementar salvamento atômico (`prisma.$transaction`). Ou salva a partida inteira, ou não salva nada.

### Fase 3: A Refatoração do Legado (Aggregation)

- Remover a lógica antiga que calculava estatísticas no momento da leitura do JSON.
- Implementar o `StatisticsService`: Após o sucesso da transação da Fase 2, ler os dados do **Banco de Dados Local** e atualizar a tabela `ChampionStats` via **Incremental Upsert**.

### Fase 4: Limpeza

- Rodar `prisma migrate reset` (Recomendado devido à mudança drástica de cardinalidade).

## 4. Definição de Pronto (DoD)

1.  O banco armazena builds, runas, pings e desafios de cada jogador.
2.  A tabela `ChampionStats` continua sendo alimentada automaticamente.
3.  Nenhuma lógica de negócio depende mais da estrutura direta do JSON da Riot, apenas do nosso Banco.
