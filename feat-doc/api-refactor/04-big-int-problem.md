O JavaScript nativo tem um limite de inteiros (Number.MAX_SAFE_INTEGER, que é $2^{53} - 1$). O BigInt do banco de dados (64-bit) ultrapassa isso. Por segurança, o JSON.stringify (que o NestJS usa por baixo dos panos) se recusa a serializar BigInts para não perder precisão, lançando aquele erro chato.Aqui está a solução "Enterprise Grade": um Interceptor Global Recursivo. Ele varre qualquer resposta da sua API, acha BigInts (mesmo dentro de objetos aninhados ou arrays) e converte para String.

Passo 1: Criar o Interceptor
Crie o arquivo: src/core/interceptors/bigint.interceptor.ts

asso 2: Registrar Globalmente
Você tem duas opções. A melhor é registrar no main.ts para garantir que funcione em todas as rotas da aplicação.

Abra o src/main.ts:

Por que converter para String e não Number?Você pode se perguntar: "Mas meu gameDuration é um número, por que virou string?"O BigInt existe justamente para números maiores que $2^{53}$.Se você converter 9007199254740999n (BigInt) para Number, o JavaScript arredonda para 9007199254741000.Isso corrompe IDs. Se o matchId ou gameId fosse numérico e muito grande, você enviaria um ID errado para o frontend.String é seguro. O Frontend (Flutter/React) recebe "123456789" e lá você decide se converte para número (se for contagem) ou mantém string (se for ID).
