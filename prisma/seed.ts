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

  // ============ Users ============
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

  // ============ Countries ============
  const taiwan = await prisma.country.upsert({
    where: { code: 'TW' },
    update: {},
    create: {
      code: 'TW',
      nameEn: 'Taiwan',
      nameZh: '台灣',
      nameJa: '台湾',
      nameKo: '대만',
      isActive: true,
    },
  });
  console.log(`Created country: ${taiwan.nameEn}`);

  // ============ Cities (Regions) ============
  const cities = [
    { code: 'taipei', nameEn: 'Taipei City', nameZh: '臺北市', nameJa: '台北市', nameKo: '타이베이시' },
    { code: 'new_taipei', nameEn: 'New Taipei City', nameZh: '新北市', nameJa: '新北市', nameKo: '신베이시' },
    { code: 'taoyuan', nameEn: 'Taoyuan City', nameZh: '桃園市', nameJa: '桃園市', nameKo: '타오위안시' },
    { code: 'taichung', nameEn: 'Taichung City', nameZh: '臺中市', nameJa: '台中市', nameKo: '타이중시' },
    { code: 'tainan', nameEn: 'Tainan City', nameZh: '臺南市', nameJa: '台南市', nameKo: '타이난시' },
    { code: 'kaohsiung', nameEn: 'Kaohsiung City', nameZh: '高雄市', nameJa: '高雄市', nameKo: '가오슝시' },
    { code: 'yilan', nameEn: 'Yilan County', nameZh: '宜蘭縣', nameJa: '宜蘭県', nameKo: '이란현' },
    { code: 'hsinchu_county', nameEn: 'Hsinchu County', nameZh: '新竹縣', nameJa: '新竹県', nameKo: '신주현' },
    { code: 'hsinchu_city', nameEn: 'Hsinchu City', nameZh: '新竹市', nameJa: '新竹市', nameKo: '신주시' },
    { code: 'miaoli', nameEn: 'Miaoli County', nameZh: '苗栗縣', nameJa: '苗栗県', nameKo: '먀오리현' },
    { code: 'changhua', nameEn: 'Changhua County', nameZh: '彰化縣', nameJa: '彰化県', nameKo: '장화현' },
    { code: 'nantou', nameEn: 'Nantou County', nameZh: '南投縣', nameJa: '南投県', nameKo: '난터우현' },
    { code: 'yunlin', nameEn: 'Yunlin County', nameZh: '雲林縣', nameJa: '雲林県', nameKo: '윈린현' },
    { code: 'chiayi_county', nameEn: 'Chiayi County', nameZh: '嘉義縣', nameJa: '嘉義県', nameKo: '자이현' },
    { code: 'chiayi_city', nameEn: 'Chiayi City', nameZh: '嘉義市', nameJa: '嘉義市', nameKo: '자이시' },
    { code: 'pingtung', nameEn: 'Pingtung County', nameZh: '屏東縣', nameJa: '屏東県', nameKo: '핑둥현' },
    { code: 'taitung', nameEn: 'Taitung County', nameZh: '臺東縣', nameJa: '台東県', nameKo: '타이둥현' },
    { code: 'hualien', nameEn: 'Hualien County', nameZh: '花蓮縣', nameJa: '花蓮県', nameKo: '화롄현' },
    { code: 'penghu', nameEn: 'Penghu County', nameZh: '澎湖縣', nameJa: '澎湖県', nameKo: '펑후현' },
    { code: 'keelung', nameEn: 'Keelung City', nameZh: '基隆市', nameJa: '基隆市', nameKo: '지룽시' },
    { code: 'kinmen', nameEn: 'Kinmen County', nameZh: '金門縣', nameJa: '金門県', nameKo: '진먼현' },
    { code: 'lienchiang', nameEn: 'Lienchiang County', nameZh: '連江縣', nameJa: '連江県', nameKo: '롄장현' },
  ];

  // Check if cities already exist
  const existingCities = await prisma.city.findMany({ where: { countryId: taiwan.id } });
  if (existingCities.length === 0) {
    for (const city of cities) {
      await prisma.city.create({
        data: {
          countryId: taiwan.id,
          code: city.code,
          nameEn: city.nameEn,
          nameZh: city.nameZh,
          nameJa: city.nameJa,
          nameKo: city.nameKo,
          isActive: true,
        },
      });
    }
    console.log(`Created ${cities.length} cities`);
  } else {
    console.log(`Cities already exist (${existingCities.length} found), skipping...`);
  }

  // ============ Categories ============
  const categories = [
    { code: 'food', nameEn: 'Food', nameZh: '美食', colorHex: '#f97316', sortOrder: 1 },
    { code: 'accommodation', nameEn: 'Accommodation', nameZh: '住宿', colorHex: '#8b5cf6', sortOrder: 2 },
    { code: 'attraction', nameEn: 'Attraction', nameZh: '景點', colorHex: '#22c55e', sortOrder: 3 },
    { code: 'shopping', nameEn: 'Shopping', nameZh: '購物', colorHex: '#ec4899', sortOrder: 4 },
    { code: 'entertainment', nameEn: 'Entertainment', nameZh: '娛樂', colorHex: '#eab308', sortOrder: 5 },
    { code: 'activity', nameEn: 'Activity', nameZh: '活動', colorHex: '#14b8a6', sortOrder: 6 },
    { code: 'culture', nameEn: 'Culture & Education', nameZh: '生態文化教育', colorHex: '#6366f1', sortOrder: 7 },
    { code: 'tour', nameEn: 'Tour Experience', nameZh: '遊程體驗', colorHex: '#3b82f6', sortOrder: 8 },
  ];

  for (const cat of categories) {
    await prisma.category.upsert({
      where: { code: cat.code },
      update: {},
      create: {
        code: cat.code,
        nameEn: cat.nameEn,
        nameZh: cat.nameZh,
        colorHex: cat.colorHex,
        sortOrder: cat.sortOrder,
        isActive: true,
      },
    });
  }
  console.log(`Created ${categories.length} categories`);

  // ============ Subcategories ============
  const foodCategory = await prisma.category.findUnique({ where: { code: 'food' } });
  const accommodationCategory = await prisma.category.findUnique({ where: { code: 'accommodation' } });
  const attractionCategory = await prisma.category.findUnique({ where: { code: 'attraction' } });

  // Check if subcategories already exist
  const existingSubcategories = await prisma.subcategory.findMany();
  if (existingSubcategories.length === 0) {
    if (foodCategory) {
      const foodSubs = [
        { code: 'hotpot', nameEn: 'Hot Pot', nameZh: '火鍋', preferredTimeSlot: 'dinner' },
        { code: 'ramen', nameEn: 'Ramen', nameZh: '拉麵', preferredTimeSlot: 'lunch' },
        { code: 'cafe', nameEn: 'Cafe', nameZh: '咖啡廳', preferredTimeSlot: 'afternoon' },
        { code: 'breakfast', nameEn: 'Breakfast', nameZh: '早餐', preferredTimeSlot: 'morning' },
        { code: 'night_market', nameEn: 'Night Market', nameZh: '夜市', preferredTimeSlot: 'evening' },
        { code: 'dessert', nameEn: 'Dessert', nameZh: '甜點', preferredTimeSlot: 'afternoon' },
        { code: 'local_cuisine', nameEn: 'Local Cuisine', nameZh: '在地小吃', preferredTimeSlot: 'anytime' },
      ];
      for (const sub of foodSubs) {
        await prisma.subcategory.create({
          data: {
            categoryId: foodCategory.id,
            code: sub.code,
            nameEn: sub.nameEn,
            nameZh: sub.nameZh,
            preferredTimeSlot: sub.preferredTimeSlot,
            isActive: true,
          },
        });
      }
      console.log(`Created ${foodSubs.length} food subcategories`);
    }

    if (accommodationCategory) {
      const accommodationSubs = [
        { code: 'hotel', nameEn: 'Hotel', nameZh: '旅館' },
        { code: 'boutique_hotel', nameEn: 'Boutique Hotel', nameZh: '設計旅店' },
        { code: 'hostel', nameEn: 'Hostel', nameZh: '青年旅館' },
        { code: 'bnb', nameEn: 'B&B', nameZh: '民宿' },
      ];
      for (const sub of accommodationSubs) {
        await prisma.subcategory.create({
          data: {
            categoryId: accommodationCategory.id,
            code: sub.code,
            nameEn: sub.nameEn,
            nameZh: sub.nameZh,
            preferredTimeSlot: 'anytime',
            isActive: true,
          },
        });
      }
      console.log(`Created ${accommodationSubs.length} accommodation subcategories`);
    }

    if (attractionCategory) {
      const attractionSubs = [
        { code: 'nature', nameEn: 'Nature', nameZh: '自然景觀' },
        { code: 'temple', nameEn: 'Temple', nameZh: '寺廟' },
        { code: 'museum', nameEn: 'Museum', nameZh: '博物館' },
        { code: 'park', nameEn: 'Park', nameZh: '公園' },
        { code: 'historical', nameEn: 'Historical Site', nameZh: '古蹟' },
      ];
      for (const sub of attractionSubs) {
        await prisma.subcategory.create({
          data: {
            categoryId: attractionCategory.id,
            code: sub.code,
            nameEn: sub.nameEn,
            nameZh: sub.nameZh,
            preferredTimeSlot: 'anytime',
            isActive: true,
          },
        });
      }
      console.log(`Created ${attractionSubs.length} attraction subcategories`);
    }
  } else {
    console.log(`Subcategories already exist (${existingSubcategories.length} found), skipping...`);
  }

  // ============ Merchant Claims & Itinerary Cards ============
  // Check if merchant claims already exist
  const existingClaims = await prisma.merchantClaim.findMany({ where: { merchantId: merchant.id } });
  if (existingClaims.length === 0) {
    // Create a MerchantClaim for the test merchant
    const claim = await prisma.merchantClaim.create({
      data: {
        merchantId: merchant.id,
        googlePlaceId: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
        placeName: "王記小吃店",
        address: '宜蘭縣宜蘭市中正路88號',
        status: 'APPROVED',
        draftCard: {
          create: {
            title: '王記小吃店 - 在地美食推薦',
            description: '傳承三代的道地宜蘭小吃，招牌肉羹湯、米粉炒是必點美食。',
            imageUrl: 'https://example.com/wangs-shop.jpg',
            category: 'food',
            discountInfo: '出示扭蛋卡享9折優惠',
          },
        },
      },
    });
    console.log(`Created merchant claim: ${claim.placeName}`);

    // Create an ItineraryCard (official published card)
    const card = await prisma.itineraryCard.create({
      data: {
        merchantId: merchant.id,
        title: '王記小吃店',
        description: '傳承三代的道地宜蘭小吃，招牌肉羹湯、米粉炒是必點美食。營業超過50年，是在地人推薦的隱藏美食。',
        imageUrl: 'https://example.com/wangs-shop.jpg',
        googlePlaceId: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
        isPublished: true,
      },
    });
    console.log(`Created itinerary card: ${card.title}`);

    // Create a CouponSetting for the card
    const coupon = await prisma.couponSetting.create({
      data: {
        merchantId: merchant.id,
        title: '9折優惠券',
        description: '出示此券享全品項9折優惠，每人限用一次',
        isActive: true,
        cardId: card.id,
      },
    });
    console.log(`Created coupon setting: ${coupon.title}`);

    // Add the card to the gacha pool
    await prisma.gachaItem.create({
      data: {
        cardId: card.id,
        poolName: 'yilan_food',
        weight: 10,
      },
    });
    console.log('Added card to gacha pool: yilan_food');

    // Create a collection for the consumer
    await prisma.userCollection.create({
      data: {
        userId: consumerA.id,
        cardId: card.id,
      },
    });
    console.log(`Added card to consumer collection`);
  } else {
    console.log(`Merchant claims already exist (${existingClaims.length} found), skipping...`);
  }

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
