import { PrismaClient, UserRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import bcrypt from 'bcrypt';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Start seeding...');

  const passwordHash = await bcrypt.hash('123456', 10);

  const consumerA = await prisma.user.upsert({
    where: { email: 'consumer@test.com' },
    update: {},
    create: {
      email: 'consumer@test.com',
      passwordHash,
      role: UserRole.CONSUMER,
      consumerProfile: {
        create: {
          name: 'Xiao Ming',
          gachaTickets: 10,
        },
      },
    },
  });
  console.log(`Created consumer: ${consumerA.email}`);

  const plannerYilan = await prisma.user.upsert({
    where: { email: 'planner_yilan@test.com' },
    update: {},
    create: {
      email: 'planner_yilan@test.com',
      passwordHash,
      role: UserRole.PLANNER,
      plannerProfile: {
        create: {
          name: 'Planner Mei',
          region: 'Yilan',
          isOnline: true,
          rating: 5.0,
        },
      },
    },
  });
  console.log(`Created planner (Yilan): ${plannerYilan.email}`);

  const plannerTaipei = await prisma.user.upsert({
    where: { email: 'planner_taipei@test.com' },
    update: {},
    create: {
      email: 'planner_taipei@test.com',
      passwordHash,
      role: UserRole.PLANNER,
      plannerProfile: {
        create: {
          name: 'Planner Hua',
          region: 'Taipei',
          isOnline: false,
          rating: 4.8,
        },
      },
    },
  });
  console.log(`Created planner (Taipei): ${plannerTaipei.email}`);

  const merchant = await prisma.user.upsert({
    where: { email: 'merchant@test.com' },
    update: {},
    create: {
      email: 'merchant@test.com',
      passwordHash,
      role: UserRole.MERCHANT,
      merchantProfile: {
        create: {
          businessName: "Wang's Shop",
          address: 'No. 88, Zhongzheng Road, Yilan City',
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
    await pool.end();
  });
