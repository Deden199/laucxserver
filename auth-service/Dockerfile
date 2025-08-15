# Use Node.js official image
FROM node:20-alpine

# Set working directory
WORKDIR /usr/src/app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Environment variables
ARG PORT=5000
ARG JWT_SECRET
ARG DATABASE_URL
ENV PORT=${PORT}
ENV JWT_SECRET=${JWT_SECRET}
ENV DATABASE_URL=${DATABASE_URL}

# Expose port
EXPOSE ${PORT}

# Start the application
CMD ["npm", "run", "start"]
