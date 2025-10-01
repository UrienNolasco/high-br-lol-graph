# Guia de Rate Limiting - API da Riot Games

## Visão Geral

Este projeto implementa um sistema robusto de controle de rate limiting para respeitar os limites da API da Riot Games para chaves de desenvolvimento:

- **20 requisições por segundo**
- **100 requisições por 2 minutos**

## Componentes Implementados

### 1. RateLimitService (`src/core/riot/rate-limit.service.ts`)

Implementa o algoritmo **Token Bucket** para controlar as requisições:

- **Tokens por segundo**: 20 tokens recarregados a cada segundo
- **Tokens por minuto**: 100 tokens recarregados a cada minuto
- **Burst limit**: 25 tokens para lidar com picos de requisições

**Principais métodos:**

- `waitForToken()`: Aguarda até que tokens estejam disponíveis
- `getStatus()`: Retorna o status atual dos tokens
- `resetTokens()`: Força o reset dos tokens (útil para testes)

### 2. RetryService (`src/core/riot/retry.service.ts`)

Implementa retry automático com **backoff exponencial**:

- **Máximo de tentativas**: 3 retries
- **Delay base**: 1 segundo
- **Multiplicador**: 2x a cada tentativa
- **Delay máximo**: 30 segundos
- **Jitter**: Variação aleatória para evitar thundering herd

**Códigos de erro retryable:**

- 429 (Too Many Requests)
- 500, 502, 503, 504 (Erros de servidor)
- Erros de rede (ECONNABORTED, ENOTFOUND, etc.)

### 3. RateLimitInterceptor (`src/core/riot/rate-limit.interceptor.ts`)

Interceptor que aplica rate limiting automaticamente em todas as requisições HTTP.

### 4. Integração no RiotService

Todos os métodos do `RiotService` foram atualizados para usar rate limiting e retry:

```typescript
async getHighEloPuids(): Promise<string[]> {
  return this.retryService.executeWithRetry(async () => {
    await this.rateLimitService.waitForToken();
    // ... requisições sequenciais com rate limiting
  }, 'getHighEloPuids');
}
```

## Como Funciona

### Fluxo de Requisição

1. **Rate Limiting**: Antes de cada requisição, o sistema verifica se há tokens disponíveis
2. **Aguardo**: Se não há tokens, calcula o tempo de espera necessário
3. **Requisição**: Faz a requisição para a API da Riot
4. **Retry**: Em caso de falha, aplica retry com backoff exponencial
5. **Logs**: Registra todas as operações para monitoramento

### Controle de Concorrência

- **Sequencial**: As requisições são feitas sequencialmente para garantir que o rate limit seja respeitado
- **Token Bucket**: O algoritmo permite burst de requisições quando há tokens acumulados
- **Auto-recuperação**: Tokens são recarregados automaticamente baseado no tempo

## Monitoramento

### Endpoints de Monitoramento

O sistema expõe endpoints para monitorar o status do rate limiting:

```bash
# Verificar status atual
GET /api/rate-limit/status

# Resetar tokens (útil para testes)
GET /api/rate-limit/reset
```

### Exemplo de Resposta do Status

```json
{
  "tokensPerSecond": 18,
  "tokensPerMinute": 95,
  "config": {
    "requestsPerSecond": 20,
    "requestsPerMinute": 100,
    "burstLimit": 25
  },
  "canMakeRequest": true
}
```

### Logs

O sistema registra logs detalhados:

```
[RateLimitService] Rate limit: Tokens restantes - Segundo: 18, Minuto: 95
[RateLimitService] Rate limit atingido. Aguardando 1250ms antes da próxima requisição
[RetryService] Falha na tentativa 1/4 para getHighEloPuids. Tentando novamente em 1000ms...
```

## Configuração

### Variáveis de Ambiente

```bash
RIOT_API_KEY=sua_chave_da_riot_aqui
```

### Personalização

Os limites podem ser ajustados no `RateLimitService`:

```typescript
private readonly config: RateLimitConfig = {
  requestsPerSecond: 20,  // Ajustar conforme necessário
  requestsPerMinute: 100, // Ajustar conforme necessário
  burstLimit: 25,         // Limite de burst
};
```

## Benefícios

1. **Conformidade**: Respeita automaticamente os limites da API da Riot
2. **Resilência**: Retry automático em caso de falhas temporárias
3. **Eficiência**: Algoritmo Token Bucket permite burst quando possível
4. **Monitoramento**: Logs e endpoints para acompanhar o status
5. **Transparente**: Não requer mudanças no código que usa o RiotService

## Uso

O rate limiting é aplicado automaticamente. Não é necessário fazer mudanças no código existente:

```typescript
// Este código agora automaticamente respeita rate limits
const puuids = await this.riotService.getHighEloPuids();
const matchIds = await this.riotService.getMatchIdsByPuuid(puuid);
const match = await this.riotService.getMatchById(matchId);
```

## Troubleshooting

### Rate Limit Excedido

Se você ver logs de "Rate limit atingido", o sistema está funcionando corretamente e aguardando tokens se recarregarem.

### Muitos Retries

Se há muitos retries, verifique:

1. Conectividade com a internet
2. Status da API da Riot Games
3. Validade da chave de API

### Performance

Para melhorar a performance:

1. Ajuste os limites conforme sua chave de API
2. Considere usar cache para dados que não mudam frequentemente
3. Implemente processamento em lote quando possível
