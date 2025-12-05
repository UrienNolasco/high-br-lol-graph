#!/bin/sh
set -e

echo "Executando migrações do banco de dados..."
npx prisma migrate deploy

echo "Iniciando aplicação..."
exec "$@"
