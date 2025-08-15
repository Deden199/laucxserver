import { PrismaClient } from '@prisma/client';
import { config } from '../config';

let prisma: PrismaClient;

try {
  prisma = new PrismaClient({
    log: config.nodeEnv === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });
} catch {
  prisma = {} as any;
}

export { prisma };
