FROM node:20-alpine AS builder
WORKDIR /app

# Install dependencies
COPY withdrawal-service/package.json ./
COPY withdrawal-service/tsconfig.json ./
RUN npm install -g prisma \
    && npm install

# Copy source code
COPY src/prisma ./src/prisma
COPY withdrawal-service/src ./src

# Generate Prisma client
ARG DATABASE_URL="mongodb://localhost:27017/dev"
ENV DATABASE_URL=${DATABASE_URL}
RUN prisma generate --schema=src/prisma/schema.prisma

# Build the application
RUN npm run build \
    && npm prune --production

FROM node:20-alpine
WORKDIR /app

# Copy build artifacts
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# Environment variables
ARG DATABASE_URL="mongodb://localhost:27017/dev"
ENV PORT=5200
ENV JWT_SECRET=changeme
ENV DATABASE_URL=${DATABASE_URL}
ENV HILOGATE_MERCHANT_ID=
ENV HILOGATE_SECRET_KEY=
ENV HILOGATE_ENV=sandbox
ENV HILOGATE_BASE_URL=https://app.hilogate.com
ENV OY_API_KEY=
ENV OY_USERNAME=
ENV OY_BASE_URL=https://api-stg.oyindonesia.com

# Expose port and run
EXPOSE ${PORT}
CMD ["npm", "run", "start"]
