FROM node:20-alpine

WORKDIR /payment-service

COPY payment-service/package*.json ./
RUN npm install

COPY payment-service/tsconfig.json ./
COPY payment-service/src ./src
COPY shared /shared
COPY src/prisma /prisma

RUN npx prisma generate --schema=/prisma/schema.prisma
RUN npm run build

ENV PORT=5100
EXPOSE ${PORT}

CMD ["npm", "run", "start"]
