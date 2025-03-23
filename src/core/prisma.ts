import { PrismaClient } from '@prisma/client';
import { config } from '../config';

// This is a helper function that instantiates Prisma
const instantiatePrisma = () => {
  const prisma = new PrismaClient({
    log: config.node_env === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

  return prisma;
};

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma = globalForPrisma.prisma ?? instantiatePrisma();

if (config.node_env !== 'production') globalForPrisma.prisma = prisma;
