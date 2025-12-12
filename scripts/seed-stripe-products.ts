import { getUncachableStripeClient } from '../server/stripeClient';

async function seedProducts() {
  console.log('Creating Stripe products for MIBU Travel Planner Service...');
  
  const stripe = await getUncachableStripeClient();

  const existingProducts = await stripe.products.search({ query: "name:'基礎方案'" });
  if (existingProducts.data.length > 0) {
    console.log('Products already exist, skipping seed');
    return;
  }

  const basicProduct = await stripe.products.create({
    name: '基礎方案',
    description: '適合短途旅行的輕量諮詢服務，提供基本行程建議',
    metadata: {
      code: 'basic',
      nameEn: 'Basic Plan',
      durationDays: '7',
      maxMessages: '20',
    },
  });

  await stripe.prices.create({
    product: basicProduct.id,
    unit_amount: 89900,
    currency: 'twd',
    metadata: { planCode: 'basic' },
  });

  await stripe.prices.create({
    product: basicProduct.id,
    unit_amount: 2900,
    currency: 'usd',
    metadata: { planCode: 'basic' },
  });

  console.log('Created Basic Plan:', basicProduct.id);

  const standardProduct = await stripe.products.create({
    name: '進階方案',
    description: '適合中長途旅行的深度規劃服務，包含詳細行程安排與在地推薦',
    metadata: {
      code: 'standard',
      nameEn: 'Standard Plan',
      durationDays: '14',
      maxMessages: '50',
    },
  });

  await stripe.prices.create({
    product: standardProduct.id,
    unit_amount: 189900,
    currency: 'twd',
    metadata: { planCode: 'standard' },
  });

  await stripe.prices.create({
    product: standardProduct.id,
    unit_amount: 5900,
    currency: 'usd',
    metadata: { planCode: 'standard' },
  });

  console.log('Created Standard Plan:', standardProduct.id);

  const premiumProduct = await stripe.products.create({
    name: '專業方案',
    description: '全程專業陪伴服務，策劃師會協助處理所有旅程細節，即時支援',
    metadata: {
      code: 'premium',
      nameEn: 'Premium Plan',
      durationDays: '30',
      maxMessages: '-1',
    },
  });

  await stripe.prices.create({
    product: premiumProduct.id,
    unit_amount: 389900,
    currency: 'twd',
    metadata: { planCode: 'premium' },
  });

  await stripe.prices.create({
    product: premiumProduct.id,
    unit_amount: 12900,
    currency: 'usd',
    metadata: { planCode: 'premium' },
  });

  console.log('Created Premium Plan:', premiumProduct.id);

  console.log('All products created successfully!');
}

seedProducts().catch(console.error);
