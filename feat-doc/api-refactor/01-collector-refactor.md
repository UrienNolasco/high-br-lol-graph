# Refatoração: Collector Service

## Objetivo
Restaurar a funcionalidade de coleta de partidas, apontando para a nova tabela de controle.

## Mudanças Necessárias

### 1. Verificação de Idempotência
O código antigo consultava `ProcessedMatch`. Essa tabela não existe mais.
O novo Collector deve consultar a tabela principal `Match`.

```typescript
// src/modules/collector/collector.service.ts

async checkMatchExists(matchId: string): Promise<boolean> {
  // Otimização: Select apenas do ID para gastar menos memória
  const match = await this.prisma.match.findUnique({
    where: { matchId },
    select: { matchId: true } 
  });
  return !!match;
}

### 2. Fluxo
Recebe matchId da Riot/Summoner.

Chama checkMatchExists(matchId).

Se false -> Envia para fila RabbitMQ process-match.

Se true -> Ignora (Log: "Match already exists").

