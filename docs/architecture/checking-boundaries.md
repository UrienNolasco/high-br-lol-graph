# Verificação das fronteiras

Execute `npm run test:architecture` e `npm run architecture:check -- --strict`
antes de integrar uma alteração. O primeiro comando testa exemplos mínimos
válidos e inválidos; o segundo analisa o checkout atual e falha diante de
qualquer violação, ciclo, ponte ou relocação pendente. O inventário ARQ-01
permanece como evidência histórica, sem ser regenerado para acomodar a
migração. O modo sem `--strict` é reservado à inspeção durante uma migração.

As regras estão em `rules.json`. O verificador resolve imports relativos, aliases do tsconfig, imports de tipos e reexports. Ciclos de runtime, ciclos apenas de tipos, imports de módulos Nest e reciprocidade entre áreas são analisados separadamente. O grafo Nest representa `@Module().imports`; ele não substitui o teste de inicialização dos providers.

`violations-baseline.json` contém apenas violações existentes durante ARQ-02, cada uma com responsável e card de remoção. IDs não dependem de números de linha. Novas violações falham; exceções que deixaram de existir também são apontadas. `node scripts/architecture-check.cjs --prune` remove somente entradas obsoletas e se recusa a cadastrar violações novas. Não existe comando de atualização automática que aceite regressões.

O CI executa os testes e o verificador em PRs e pushes para `dev`/`prod`, além da etapa de testes anterior ao deploy. `ARCHITECTURE_BASE_REF` informa a revisão anterior: a lista atual deve ser um subconjunto da lista daquela revisão. Um baseline anterior vazio também impede crescimento. A ausência do arquivo antes de sua introdução é o único caso de inicialização da lista; referência Git inválida ou JSON inválido não equivale a permissão de reinicializar.

ARQ-13 deve zerar as exceções e passar também em `node scripts/architecture-check.cjs --strict`. Contratos públicos podem publicar capacidades puras específicas do próprio domínio, mas não expor repositórios ou adapters. Colocar uma implementação atrás de um reexport não elimina suas dependências transitivas.

O baseline funcional, suas limitações de corpus e os resultados de desempenho continuam em `validation-baseline.json` e `evidence/`. Verificação arquitetural não substitui testes de comportamento, persistência e atomicidade.
