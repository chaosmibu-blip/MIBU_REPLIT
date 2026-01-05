import { db } from "../db";
import { systemConfigs } from "@shared/schema";

const defaultConfigs = [
  { 
    category: 'gacha', 
    key: 'daily_free_quota', 
    value: 3, 
    valueType: 'number',
    label: '每日免費扭蛋次數', 
    description: '用戶每天可免費使用扭蛋的次數',
    uiType: 'slider',
    uiOptions: { min: 1, max: 10, step: 1 },
    validation: { min: 1, max: 10 },
    isReadOnly: false,
  },
  { 
    category: 'gacha', 
    key: 'places_per_gacha', 
    value: 5, 
    valueType: 'number',
    label: '每次扭蛋景點數', 
    description: '每次扭蛋抽取的景點數量',
    uiType: 'slider',
    uiOptions: { min: 3, max: 10, step: 1 },
    validation: { min: 3, max: 10 },
    isReadOnly: true,
  },
  { 
    category: 'gacha', 
    key: 'duplicate_threshold', 
    value: 0.7, 
    valueType: 'number',
    label: 'SEO 去重閾值', 
    description: '行程相似度超過此閾值視為重複',
    uiType: 'slider',
    uiOptions: { min: 0.5, max: 1.0, step: 0.05 },
    validation: { min: 0.5, max: 1.0 },
    isReadOnly: false,
  },
  { 
    category: 'merchant', 
    key: 'pro_place_limit', 
    value: 5, 
    valueType: 'number',
    label: 'Pro 商家行程卡上限', 
    description: 'Pro 等級商家可擁有的行程卡數量',
    uiType: 'input',
    validation: { min: 1, max: 20 },
    isReadOnly: false,
  },
  { 
    category: 'merchant', 
    key: 'premium_place_limit', 
    value: 20, 
    valueType: 'number',
    label: 'Premium 商家行程卡上限', 
    description: 'Premium 等級商家可擁有的行程卡數量',
    uiType: 'input',
    validation: { min: 5, max: 100 },
    isReadOnly: false,
  },
  { 
    category: 'merchant', 
    key: 'grace_period_days', 
    value: 3, 
    valueType: 'number',
    label: '付款失敗寬限天數', 
    description: '訂閱付款失敗後的寬限期',
    uiType: 'input',
    validation: { min: 1, max: 14 },
    isReadOnly: false,
  },
  { 
    category: 'places', 
    key: 'review_required', 
    value: true, 
    valueType: 'boolean',
    label: '新景點需審核', 
    description: '新增的景點是否需要管理員審核',
    uiType: 'switch',
    isReadOnly: false,
  },
  { 
    category: 'places', 
    key: 'min_photos', 
    value: 1, 
    valueType: 'number',
    label: '最少照片數', 
    description: '景點資料最少需要的照片數量',
    uiType: 'input',
    validation: { min: 0, max: 5 },
    isReadOnly: false,
  },
];

export async function seedConfigs() {
  console.log('🔧 Seeding system configs...');
  
  for (const config of defaultConfigs) {
    try {
      await db.insert(systemConfigs)
        .values({ 
          ...config, 
          defaultValue: config.value,
        })
        .onConflictDoNothing();
    } catch (error) {
      console.error(`Failed to seed config ${config.category}:${config.key}:`, error);
    }
  }
  
  console.log('✅ System configs seeded successfully');
}
