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

  // ============ 八大分類體系 (8 Main Categories) ============
  // 先清除舊的子分類和分類
  await prisma.subcategory.deleteMany({});
  await prisma.category.deleteMany({});
  console.log('Cleared old categories and subcategories');

  const categoriesWithSubs = [
    {
      code: 'FOOD',
      nameEn: 'Food',
      nameZh: '食',
      colorHex: '#f97316',
      sortOrder: 1,
      subcategories: [
        { code: 'local_snack', nameEn: 'Local Snacks / Night Market', nameZh: '在地小吃/夜市' },
        { code: 'special_restaurant', nameEn: 'Special Restaurant', nameZh: '特色餐廳' },
        { code: 'foreign_cuisine', nameEn: 'Foreign Cuisine', nameZh: '異國料理' },
        { code: 'cafe_dessert', nameEn: 'Cafe / Dessert', nameZh: '咖啡/甜點' },
        { code: 'bar', nameEn: 'Bar / Bistro', nameZh: '酒吧/餐酒館' },
        { code: 'special_diet', nameEn: 'Special Diet', nameZh: '特殊飲食' },
      ],
    },
    {
      code: 'STAY',
      nameEn: 'Accommodation',
      nameZh: '宿',
      colorHex: '#8b5cf6',
      sortOrder: 2,
      subcategories: [
        { code: 'star_hotel', nameEn: 'Star Hotel', nameZh: '星級飯店' },
        { code: 'regular_hotel', nameEn: 'Regular Hotel', nameZh: '一般旅館' },
        { code: 'bnb', nameEn: 'B&B', nameZh: '民宿' },
        { code: 'hostel', nameEn: 'Hostel', nameZh: '青年旅館' },
        { code: 'camping', nameEn: 'Camping', nameZh: '露營' },
        { code: 'resort', nameEn: 'Resort', nameZh: '休閒渡假村' },
        { code: 'hot_spring_hotel', nameEn: 'Hot Spring Hotel', nameZh: '溫泉飯店' },
      ],
    },
    {
      code: 'ECO',
      nameEn: 'Culture & Ecology',
      nameZh: '生態文化',
      colorHex: '#6366f1',
      sortOrder: 3,
      subcategories: [
        { code: 'historical', nameEn: 'Historical Site', nameZh: '歷史古蹟' },
        { code: 'museum', nameEn: 'Museum', nameZh: '博物館' },
        { code: 'factory_tour', nameEn: 'Factory Tour', nameZh: '觀光工廠' },
        { code: 'nature_eco', nameEn: 'Nature & Ecology', nameZh: '自然生態' },
        { code: 'religious', nameEn: 'Religious Site', nameZh: '宗教場所' },
        { code: 'indigenous', nameEn: 'Indigenous Tribe', nameZh: '原民部落' },
        { code: 'science_edu', nameEn: 'Science Education', nameZh: '科普教育' },
      ],
    },
    {
      code: 'EXP',
      nameEn: 'Experience',
      nameZh: '遊程體驗',
      colorHex: '#3b82f6',
      sortOrder: 4,
      subcategories: [
        { code: 'diy', nameEn: 'DIY Workshop', nameZh: '手作DIY' },
        { code: 'outdoor_adventure', nameEn: 'Outdoor Adventure', nameZh: '戶外冒險' },
        { code: 'local_tour', nameEn: 'Local Guided Tour', nameZh: '在地導覽' },
        { code: 'farm_experience', nameEn: 'Farm Experience', nameZh: '農事體驗' },
        { code: 'wellness', nameEn: 'Wellness', nameZh: '療癒身心靈' },
        { code: 'costume', nameEn: 'Costume Experience', nameZh: '服飾體驗' },
      ],
    },
    {
      code: 'FUN',
      nameEn: 'Entertainment',
      nameZh: '娛樂設施',
      colorHex: '#eab308',
      sortOrder: 5,
      subcategories: [
        { code: 'theme_park', nameEn: 'Theme Park', nameZh: '主題樂園' },
        { code: 'zoo', nameEn: 'Zoo / Aquarium', nameZh: '動物園' },
        { code: 'kids_park', nameEn: 'Kids Park', nameZh: '親子樂園' },
        { code: 'hot_spring_spa', nameEn: 'Hot Spring / SPA', nameZh: '溫泉SPA' },
        { code: 'cinema', nameEn: 'Cinema / Entertainment', nameZh: '影視娛樂' },
        { code: 'gaming', nameEn: 'Gaming', nameZh: '博弈競技' },
      ],
    },
    {
      code: 'EVENT',
      nameEn: 'Events',
      nameZh: '活動',
      colorHex: '#14b8a6',
      sortOrder: 6,
      subcategories: [
        { code: 'festival', nameEn: 'Festival', nameZh: '節慶祭典' },
        { code: 'seasonal', nameEn: 'Seasonal', nameZh: '季節限定' },
        { code: 'art_performance', nameEn: 'Art & Performance', nameZh: '藝文展演' },
        { code: 'sports', nameEn: 'Sports Event', nameZh: '體育賽事' },
        { code: 'market_expo', nameEn: 'Market & Expo', nameZh: '市集展覽' },
      ],
    },
    {
      code: 'SPOT',
      nameEn: 'Attractions',
      nameZh: '景點',
      colorHex: '#22c55e',
      sortOrder: 7,
      subcategories: [
        { code: 'nature_landscape', nameEn: 'Nature Landscape', nameZh: '自然景觀' },
        { code: 'coastal', nameEn: 'Coastal', nameZh: '海岸風光' },
        { code: 'urban_park', nameEn: 'Urban Park', nameZh: '都會公園' },
        { code: 'architecture', nameEn: 'Special Architecture', nameZh: '特色建築' },
        { code: 'observation', nameEn: 'Observation / Night View', nameZh: '觀景台/夜景' },
        { code: 'instagram', nameEn: 'Instagram Spot', nameZh: '網美打卡點' },
      ],
    },
    {
      code: 'SHOP',
      nameEn: 'Shopping',
      nameZh: '購物',
      colorHex: '#ec4899',
      sortOrder: 8,
      subcategories: [
        { code: 'department', nameEn: 'Department Store', nameZh: '百貨公司' },
        { code: 'shopping_district', nameEn: 'Shopping District', nameZh: '商圈' },
        { code: 'souvenir', nameEn: 'Souvenir', nameZh: '特色伴手禮' },
        { code: 'duty_free', nameEn: 'Duty Free', nameZh: '免稅店' },
        { code: 'traditional_market', nameEn: 'Traditional Market', nameZh: '傳統市場' },
        { code: 'creative', nameEn: 'Creative Shop', nameZh: '文創商店' },
      ],
    },
  ];

  for (const cat of categoriesWithSubs) {
    const createdCat = await prisma.category.create({
      data: {
        code: cat.code,
        nameEn: cat.nameEn,
        nameZh: cat.nameZh,
        colorHex: cat.colorHex,
        sortOrder: cat.sortOrder,
        isActive: true,
      },
    });

    for (const sub of cat.subcategories) {
      await prisma.subcategory.create({
        data: {
          categoryId: createdCat.id,
          code: sub.code,
          nameEn: sub.nameEn,
          nameZh: sub.nameZh,
          isActive: true,
        },
      });
    }
    console.log(`Created category ${cat.nameZh} with ${cat.subcategories.length} subcategories`);
  }

  // ============ Merchant Claims & Itinerary Cards ============
  const existingClaims = await prisma.merchantClaim.findMany({ where: { merchantId: merchant.id } });
  if (existingClaims.length === 0) {
    const yilanCity = await prisma.city.findFirst({ where: { code: 'yilan' } });
    const foodCategory = await prisma.category.findFirst({ where: { code: 'FOOD' } });
    const localSnackSub = foodCategory
      ? await prisma.subcategory.findFirst({ where: { categoryId: foodCategory.id, code: 'local_snack' } })
      : null;

    const claim = await prisma.merchantClaim.create({
      data: {
        merchantId: merchant.id,
        googlePlaceId: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
        placeName: '王記小吃店',
        address: '宜蘭縣宜蘭市中正路88號',
        status: 'APPROVED',
        isDispute: false,
        draftCard: {
          create: {
            title: '王記小吃店 - 在地美食推薦',
            description: '傳承三代的道地宜蘭小吃，招牌肉羹湯、米粉炒是必點美食。',
            imageUrl: 'https://example.com/wangs-shop.jpg',
            subcategoryId: localSnackSub?.id,
            discountInfo: '出示扭蛋卡享9折優惠',
          },
        },
      },
    });
    console.log(`Created merchant claim: ${claim.placeName}`);

    const card = await prisma.itineraryCard.create({
      data: {
        merchantId: merchant.id,
        title: '王記小吃店',
        description: '傳承三代的道地宜蘭小吃，招牌肉羹湯、米粉炒是必點美食。營業超過50年，是在地人推薦的隱藏美食。',
        imageUrl: 'https://example.com/wangs-shop.jpg',
        googlePlaceId: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
        cityId: yilanCity?.id,
        subcategoryId: localSnackSub?.id,
        isPublished: true,
      },
    });
    console.log(`Created itinerary card: ${card.title}`);

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

    await prisma.gachaItem.create({
      data: {
        cardId: card.id,
        poolName: 'yilan_food',
        weight: 10,
      },
    });
    console.log('Added card to gacha pool: yilan_food');

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
