# --------------------------------------------------------------------
# Dockerfile de Desenvolvimento para high-br-lol-graph
# --------------------------------------------------------------------
FROM node:20-alpine

WORKDIR /usr/src/app

# Instala as dependências primeiro para aproveitar o cache do Docker
COPY package*.json ./
RUN npm install

# Copia o schema do Prisma e gera o client
# Esta camada só será reconstruída se o schema mudar
COPY prisma ./prisma/
RUN npx prisma generate

# Copia o restante do código da aplicação
COPY . .

EXPOSE 3000

CMD ["npm", "run", "start:dev"]