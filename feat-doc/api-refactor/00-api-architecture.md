# API Architecture: Mobile-First Data Delivery

## 1. O Princípio da "Economia de Payload"
Diferente da Web, no Mobile não podemos enviar JSONs de 5MB.
* **Listas (Histórico):** Devem ser leves. Sem gráficos, sem runas detalhadas. Apenas KDA, Campeão e Resultado.
* **Detalhes (Match):** Payload completo. Aqui enviamos os Arrays de gráfico (`goldGraph`) e Mapas de Calor (`killPositions`).

## 2. O Desafio do BigInt
O novo Schema usa `BigInt` para Dano e Timestamps.
* **Problema:** `JSON.stringify` quebra com BigInt.
* **Solução:** Implementar um **Global Interceptor** ou **Transform** nos DTOs para converter BigInt em String (ou Number, se seguro) antes de enviar para o cliente.

## 3. Camadas de Refatoração
1.  **Collector:** Ajustar para verificar duplicidade na tabela `Match`.
2.  **Match API:** Criar endpoints que exploram a granularidade do Schema V2.
3.  **Stats API:** Adaptar a leitura de Tier List para usar a tabela `ChampionStats` (que agora é populada pelo Worker).