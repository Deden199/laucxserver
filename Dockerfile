FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Generate Prisma client and build the project
RUN npx prisma generate --schema=src/prisma/schema.prisma
RUN npm run build

# Set and expose application port
ENV PORT=5000
EXPOSE ${PORT}

# Start the application
CMD ["npm", "run", "start"]
