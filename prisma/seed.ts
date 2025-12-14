import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Start seeding...');

  const passwordHash = await bcrypt.hash('123456', 10);

  const traveler = await prisma.user.upsert({
    where: { email: 'traveler@test.com' },
    update: {},
    create: {
      email: 'traveler@test.com',
      passwordHash,
      role: UserRole.CONSUMER,
      consumerProfile: {
        create: {
          name: 'Test Traveler',
          gachaTickets: 10,
        },
      },
    },
  });
  console.log(`Created consumer: ${traveler.email}`);

  const planner = await prisma.user.upsert({
    where: { email: 'planner@test.com' },
    update: {},
    create: {
      email: 'planner@test.com',
      passwordHash,
      role: UserRole.PLANNER,
      plannerProfile: {
        create: {
          name: 'Test Planner',
          region: 'Yilan',
          isOnline: true,
        },
      },
    },
  });
  console.log(`Created planner: ${planner.email}`);

  const merchant = await prisma.user.upsert({
    where: { email: 'shop@test.com' },
    update: {},
    create: {
      email: 'shop@test.com',
      passwordHash,
      role: UserRole.MERCHANT,
      merchantProfile: {
        create: {
          businessName: 'Test Shop',
          address: 'No. 123, Test Street, Yilan',
        },
      },
    },
  });
  console.log(`Created merchant: ${merchant.email}`);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@test.com' },
    update: {},
    create: {
      email: 'admin@test.com',
      passwordHash,
      role: UserRole.ADMIN,
    },
  });
  console.log(`Created admin: ${admin.email}`);

  console.log('Seeding finished.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
