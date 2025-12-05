#!/bin/sh
set -e

echo "Executando migrações do banco de dados..."
npx migrate deploy

echo "Iniciando aplicação..."
exec "$@"
