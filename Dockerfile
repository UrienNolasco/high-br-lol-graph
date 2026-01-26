# --------------------------------------------------------------------
# Dockerfile de Desenvolvimento para high-br-lol-graph
# Suporta hot-reload com volumes montados do host
# --------------------------------------------------------------------
FROM node:20-alpine

WORKDIR /usr/src/app

# Instala dependências do sistema necessárias
RUN apk add --no-cache libc6-compat

# Instala as dependências primeiro para aproveitar o cache do Docker
COPY package*.json ./
RUN npm install

# Copia o schema do Prisma e gera o client
# Esta camada só será reconstruída se o schema mudar
COPY prisma ./prisma/
RUN npx prisma generate

# Cria a pasta migrations na raiz copiando de prisma/migrations (necessária para migrate deploy)
RUN cp -r prisma/migrations ./migrations 2>/dev/null || true

# Copia e configura o script de entrypoint
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000

# Configurar variável de ambiente para forçar IPv4
ENV NODE_OPTIONS="--dns-result-order=ipv4first"

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["npm", "run", "start:dev"]
