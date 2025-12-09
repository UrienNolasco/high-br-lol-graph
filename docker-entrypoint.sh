#!/bin/sh
set -e

# Executa migrations apenas se a variável RUN_MIGRATIONS estiver definida
if [ "$RUN_MIGRATIONS" = "true" ]; then
  echo "Executando migrações do banco de dados..."
  npx prisma migrate deploy
else
  echo "Pulando migrações (executadas apenas pela API)..."
fi

echo "Iniciando aplicação..."
exec "$@"
