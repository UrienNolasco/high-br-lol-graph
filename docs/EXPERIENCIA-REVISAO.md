# Revisão da partida — MET-34

Esta especificação define o consumo mobile/web das métricas, sem escolher framework ou implementar um frontend de produção. O [wireframe navegável](review/prototype.html) abre diretamente no navegador junto de `examples.js`; usa controles nativos e funciona sem servidor. Os [payloads de exemplo](review/payloads.json) são uma proposta para MET-17, não uma rota já publicada.

## Entrada e navegação

Entrada pelo histórico → selecionar partida → selecionar jogador por Riot ID (PUUID é a identidade estável) → contribuições → métrica ou momento → evidência. Link direto deve preservar partida, jogador e ID de evidência; voltar restaura seleção e posição. Partida não encontrada oferece retorno ao histórico; erro transitório oferece nova tentativa. A ausência de timeline não bloqueia valores válidos do resumo.

O cabeçalho informa campeão, posição, resultado real, duração, fila e versão; o nome da região só aparece quando conhecido. Quatro dimensões têm o mesmo peso visual: **recursos, combate, visão e estruturas**. Não existe soma, medalha, nota geral nem afirmação de quem carregou. Referência histórica futura só aparece quando coorte, N e precisão estiverem disponíveis; uma partida não produz benchmark.

Wireframe mobile (blocos empilhados; desktop coloca quatro cartões lado a lado):

```text
Histórico > Partida > Jogador [selecionar]
Fiora · TOP · Vitória · 39:28 · fila 420
[Estado da análise / cobertura quando houver falha]
[Recursos: ouro do time 28,06%          >]
[Combate: dano 34,98%; cura 2.877       >]
[Visão: 13 wards; 4 removidas          >]
[Estruturas: dano a torres 79,14%       >]
Momentos para revisar
[19:58 Morte e objetivos nos próximos 60 s >]
  > Uma morte, duas capturas. Associação temporal.
  > [19:58 registro] [20:40 torre] [20:44 Barão]
    > valor, fonte, campos, instante, limite de interpretação
```

No produto, detalhes começam com explicação em linguagem comum, valor/unidade, denominador e cobertura. IDs, fórmula e versão ficam em “Dados da evidência”, como informação secundária para inspeção. O wireframe mostra JSON completo nessa área por ser um artefato de revisão do contrato. Leitor de tela recebe rótulos textuais e atualizações de estado; navegação por teclado tem foco visível e detalhes recebem foco. Cor nunca é a única indicação de origem/ausência.

## Dois papéis, contribuições diferentes

Valores reconciliados com os dez participantes da fixture BR1_3200579475; arredondamento apenas na apresentação. A fonte de todos os totais é o resumo Match-V5; a janela é a partida completa. Shares dividem pelo total dos cinco participantes do mesmo time, não pelos dois exemplos. Código da oportunidade acompanha cada métrica.

| Dimensão / fonte | Fiora TOP | Milio UTILITY | Interpretação permitida |
| --- | ---: | ---: | --- |
| Recursos E04: goldEarned / soma do time | 28,06% | 11,85% | Distribuição do ouro, sem estimar saldo pelo goldSpent |
| Combate C02: dano a campeões / soma do time | 34,98% | 2,51% | Participação no dano, sem comparar valor geral de papéis |
| Combate C04: totalHealsOnTeammates | 2.877 | 13.741 | Pontos de cura registrados em aliados |
| Combate C04: totalDamageShieldedOnTeammates | 0 | 19.049 | Zero observado é válido; não estima mortes evitadas |
| Visão V03: wardsPlaced / wardsKilled | 13 / 4 | 46 / 6 | Contadores separados de colocação/remoção |
| Estruturas O03: damageDealtToTurrets / soma do time | 79,14% | 0% | Contribuição registrada a torres, sem afirmar split push eficiente |

Fiora pode abrir estruturas e conferir 28.592 / 36.129 × 100; Milio pode abrir cura/escudos e visão. O baixo dano de Milio não esconde essas contribuições. Não rotular dano sofrido como sobrevivência nem pings como qualidade de comunicação. Wards sem coordenadas não aparecem em um mapa exato.

O episódio selecionado para cada jogador liga a morte perto de 19:58/19:59 à torre em 20:40 e Barão em 20:44. A unidade é uma morte; as duas capturas são evidências dentro de `(morte,morte+60s]`. São exemplos selecionados, não todas as mortes elegíveis nem detecção de teamfight. Não afirmar que a morte causou os objetivos. IDs usam matchId/frameIndex/eventIndex, distinguindo registros simultâneos.

## Estados de consumo

| Estado | Apresentação | Contrato |
| --- | --- | --- |
| Carregando | Mensagem de progresso e esqueletos sem números | Estado do cliente; não fabricar métricas com zero |
| Disponível | Valor, unidade e abertura de evidência | observed/derived/estimated identificados; versão, método e cobertura |
| Campo ausente | “Indisponível: campo ausente” no cartão afetado | value=null, origin=unavailable, reason=missing_field |
| Denominador zero | “Sem base para calcular esta proporção” | zero_denominator; zero observado em um contador permanece zero |
| Baixa cobertura | Aviso junto à família afetada e N válido/total | Sem limiar universal de confiabilidade; missing_frame não invalida todo o resumo |
| Sem episódios por falta de timeline | “Não foi possível analisar os momentos” | Motivo explícito; diferente de análise completa sem ocorrências |
| Versão não suportada | Explicar quais métricas não estão disponíveis | unsupported_version; IDs de item/campeão preservados |
| Referência histórica insuficiente | “Ainda não há amostra comparável suficiente” | insufficient_sample, coorte e N quando conhecidos |
| Não encontrada / erro | Voltar / tentar novamente | 404 distinto de erro de transporte; não exibir dados de outro jogador |

O seletor do wireframe permite ensaiar carregamento, ausência, baixa cobertura, erro e não encontrada. Variações são **sintéticas** e não acrescentam partidas ao corpus. Em baixa cobertura, mantém totais do resumo e suprime apenas episódios. MET-17 deve completar testes HTTP desses estados e definir paginação/limites para evidências; a proposta exige IDs navegáveis e evita enviar o bruto inteiro. Rotas existentes preservam compatibilidade declarada em MET-01/07/08; esta task não muda endpoints.

## Validação com jogadores

Status: **não realizada; zero participantes recrutados e nenhum feedback real registrado**. O roteiro está pronto, mas não há alegação de utilidade demonstrada, retenção ou melhora de desempenho. Quando houver participantes, registrar consentimento, contexto de experiência/posição (sem credenciais), versão do protótipo, tarefas observadas e falas autorizadas. Não contatar pessoas automaticamente.

Sessão individual de 15–20 minutos, ordem Fiora/Milio alternada para reduzir efeito de aprendizado:

1. Localizar a partida e explicar duas contribuições de Fiora usando dimensões diferentes.
2. Trocar para Milio; explicar duas contribuições sem recorrer à participação no dano como nota geral.
3. Abrir um número, identificar a fonte e o denominador; explicar o que “do time” significa.
4. Abrir episódio → captura → evidência. Explicar por que sequência temporal não prova causa e por que duas capturas não contam duas mortes.
5. Alternar zero observado, campo ausente e cobertura parcial; dizer o que é conhecido e o que não se pode concluir.
6. Encontrar a ausência de referência histórica e decidir se é possível afirmar que o desempenho supera jogadores semelhantes.

Critério de compreensão por sessão: concluir cada percurso sem instrução direta; explicar corretamente unidade/denominador, ausência versus zero e limite causal. Registrar sucesso, necessidade de ajuda e tempo por tarefa, sem tratar velocidade isoladamente como qualidade. Qualquer erro de interpretação de ausência/causalidade exige revisar texto ou fluxo antes do aceite de usabilidade. O tamanho da rodada será acordado quando houver recrutamento; não inventar N representativo ou generalização estatística.

Registro a preencher: identificador pseudônimo da sessão, data, experiência/posição declaradas, ordem, versão, resultado de cada tarefa, observação literal autorizada, hipótese de problema, mudança e reteste. Separar observação do participante de interpretação da equipe. Até obter esses registros, o aceite desta task é a preparação verificável da especificação, exemplos e roteiro, conforme o cartão.

## Reprodução e revisão técnica

`python3 scripts/build-review-examples.py` reconstrói JSON e JS a partir das fixtures brutas, sem banco/rede. Cada share mantém precisão completa; cada referência temporal aponta ao evento original, e o gerador verifica as duas capturas do episódio de cada jogador. Abrir `docs/review/prototype.html` permite percorrer os quatro cartões e registros com teclado, inclusive estados sintéticos. O timestamp de processamento no exemplo é ilustrativo; não é execução real do pipeline futuro. Formato proposal-1 será consolidado em MET-17, reutilizando MetricResult da MET-01.

Validação técnica em 23/09/2026: 14 métricas reconciliadas com campos fonte, seis referências conferidas contra os eventos originais; sintaxe JS aprovada. Chromium headless percorreu dois jogadores, quatro dimensões, métrica → evidência, episódio → evento e seis estados; viewport mobile 390 px sem overflow horizontal e desktop 1280 px, sem erros de JavaScript. Isso verifica o protótipo, não substitui validação de compreensão com jogadores.
