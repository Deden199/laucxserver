import dotenv from 'dotenv';
dotenv.config();

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const password = 'supersecret';
  const hash     = await bcrypt.hash(password, 10);

  await prisma.partnerUser.upsert({
    where: { email: 'admin@launcx.com' },
    update: { password: hash, role: 'ADMIN' },
    create: {
      name:     'Admin Launcx',
      email:    'admin@launcx.com',
      password: hash,
      role:     'ADMIN',
      isActive: true,
    }
  });
  console.log('✅ Admin ready: admin@launcx.com / supersecret');

  await prisma.setting.upsert({
    where: { key: 'settlement_cron' },
    update: { value: '0 16 * * *' },
    create: { key: 'settlement_cron', value: '0 16 * * *' }
  });
  console.log('✅ Default settlement_cron set to 0 16 * * *');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
