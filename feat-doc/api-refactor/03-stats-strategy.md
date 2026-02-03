# Refatoração: Statistics Service (Tier List)

## Contexto

Antigamente, o `tier-rank.service.ts` lia de tabelas agregadas que processávamos manualmente. Agora, o Worker V2 já popula a tabela `ChampionStats` automaticamente via "Incremental Upsert".

## Mudanças na Leitura

### 1. Simplificação

O serviço de Tier Rank se torna um simples leitor de banco (CRUD).
Não há mais lógica de cálculo ("Somar kills / jogos"). O valor já está somado na tabela `ChampionStats`.

### 2. Query de Tier List

```typescript
async getTierList(patch: string, queueId: number) {
  return this.prisma.championStats.findMany({
    where: { patch, queueId },
    orderBy: {
      // Algoritmo de Ranking: (Winrate * Pesos) + (Pickrate * Pesos)
      // Pode ser feito no banco ou na memória se a lista for pequena (~160 champs)
      wins: 'desc'
    }
  });
}

3. Endpoint de Matchup (Opcional - Complexo)
Se quisermos saber "Yasuo vs Yone":

Como não temos tabela de MatchupStats no Schema V2 (decisão de design para não inflar o banco), faremos uma Aggregation Query na tabela MatchParticipant sob demanda.

Nota: Isso é pesado. Implementar Cache (Redis) de 1h para essa rota.

### 🚦 Resumo da Ordem de Execução para você

1.  **Collector:** Descomente e aponte para `db.match`. (Fácil, 10min).
2.  **API Service:** Crie os DTOs para tratar BigInt (isso vai evitar muitos erros 500). Implemente o `getMatchDetails` expondo os campos novos.
3.  **Tier Rank:** Limpe a lógica antiga. Faça ele ler apenas o que o Worker já deixou pronto na `ChampionStats`.

Quer que eu detalhe como fazer o **Interceptor para BigInt** no NestJS? É uma peça chave que muita gente esquece.
```
