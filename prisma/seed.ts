import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/common/utils/password.util';

const prisma = new PrismaClient();

async function seedUsers(): Promise<void> {
  await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: {
      email: 'admin@example.com',
      name: 'Admin',
      passwordHash: await hashPassword('Admin@123'),
      role: 'ADMIN',
      isActive: true,
    },
  });
}

async function main(): Promise<void> {
  console.log('Seeding database...');
  await seedUsers();
  console.log('Seed complete.');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
