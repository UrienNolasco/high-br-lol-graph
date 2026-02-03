# Manifesto Arquitetural: The Omniscient Database

## 1. O Problema da Escala
Estamos construindo uma ferramenta de análise profunda ("Coaching AI"). Isso exige granularidade extrema.
* **Match V5** nos dá o "O Quê" (Resultado, Build Final, KDA).
* **Timeline V5** nos dá o "Como", "Quando" e "Onde".

O desafio não é apenas armazenar, é **consultar**. Se guardarmos a timeline como um blob JSON bruto de 1MB, gerar um gráfico de "Gold Difference aos 15min" exigirá ler e parsear 1MB de texto para cada partida. Multiplique isso por 20 partidas no histórico e o app trava.

## 2. Estratégia de Otimização: "Flatten & Array"
Para otimizar a leitura no Mobile, o Worker deve processar a Timeline e "Achatar" (Flatten) os dados em arrays tipados na tabela do participante.

**Exemplo Prático:**
Em vez de navegar no JSON da timeline procurando `frame[10].participant[3].totalGold`, teremos uma coluna `goldGraph` do tipo `Int[]` na tabela do participante.
* Query: `SELECT goldGraph[15] FROM match_participants WHERE ...`
* Resultado: `4500` (Instantâneo).

## 3. Escopo de Dados (O que vamos armazenar)
O sistema deve ser capaz de reconstruir a partida virtualmente.
1.  **Dados Agregados:** KDA, Dano, Visão, Objetivos (Do Match V5).
2.  **Séries Temporais (Minuto a Minuto):** Ouro, XP, CS, Dano (Do Timeline V5).
3.  **Dados Espaciais (Heatmaps):** Coordenadas (X,Y) de mortes, kills, wards e posicionamento do jogador (Do Timeline V5).
4.  **Eventos Críticos:** Ordem exata de compra de itens e Level Up de skills.

## 4. Pipeline ETL (Extract-Transform-Load)
O Worker deixa de ser um simples "salvador de JSON" e vira um **Processador ETL Robusto**.
1.  **Extract:** Baixa Match e Timeline em paralelo.
2.  **Transform:**
    * Cruza dados (Quem matou quem? Onde?).
    * Comprime coordenadas de movimentação (Sampling).
    * Gera Arrays de progressão (0min, 1min, 2min...).
3.  **Load:** Insere em tabelas relacionais otimizadas com suporte a JSONB para metadados.