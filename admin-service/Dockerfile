FROM node:18-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

RUN npx prisma generate && npm run build

ENV PORT=5000
EXPOSE 5000

CMD ["npm", "run", "start"]
