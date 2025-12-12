import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Check, Star, Sparkles, MessageCircle, Clock, Loader2 } from 'lucide-react';

interface StripePrice {
  id: string;
  unit_amount: number;
  currency: string;
  recurring: any;
  active: boolean;
  metadata: Record<string, string>;
}

interface StripeProduct {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  metadata: {
    code?: string;
    nameEn?: string;
    durationDays?: string;
    maxMessages?: string;
  };
  prices: StripePrice[];
}

interface ServicePlansProps {
  onSelectPlan?: (plan: StripeProduct, priceId: string, paymentMethod: 'stripe' | 'payuni') => void;
  isAuthenticated: boolean;
  onLoginRequired: () => void;
}

const PLAN_FEATURES: Record<string, string[]> = {
  basic: [
    '1 對 1 策劃師諮詢',
    '基本行程建議',
    '20 則訊息額度',
    '7 天服務期間',
  ],
  standard: [
    '1 對 1 專業策劃師',
    '詳細行程安排',
    '在地推薦景點',
    '50 則訊息額度',
    '14 天服務期間',
  ],
  premium: [
    '1 對 1 資深策劃師',
    '完整旅程規劃',
    '即時支援與調整',
    '無限訊息額度',
    '30 天全程陪伴',
    '優先處理需求',
  ],
};

export const ServicePlans: React.FC<ServicePlansProps> = ({ 
  onSelectPlan, 
  isAuthenticated,
  onLoginRequired 
}) => {
  const [products, setProducts] = useState<StripeProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<StripeProduct | null>(null);
  const [showPaymentChoice, setShowPaymentChoice] = useState(false);

  useEffect(() => {
    fetch('/api/stripe/products-with-prices')
      .then(res => {
        if (!res.ok) throw new Error('載入失敗');
        return res.json();
      })
      .then(data => {
        const sorted = (data.data || []).sort((a: StripeProduct, b: StripeProduct) => {
          const order = { basic: 0, standard: 1, premium: 2 };
          const codeA = a.metadata?.code || '';
          const codeB = b.metadata?.code || '';
          return (order[codeA as keyof typeof order] ?? 99) - (order[codeB as keyof typeof order] ?? 99);
        });
        setProducts(sorted);
        setLoading(false);
      })
      .catch(err => {
        console.error('Error loading products:', err);
        setError('無法載入服務方案，請稍後再試');
        setLoading(false);
      });
  }, []);

  const handleSelectPlan = (product: StripeProduct) => {
    if (!isAuthenticated) {
      onLoginRequired();
      return;
    }
    setSelectedProduct(product);
    setShowPaymentChoice(true);
  };

  const handleStripeCheckout = async (product: StripeProduct, currency: 'twd' | 'usd') => {
    setCheckoutLoading(true);
    
    const price = product.prices.find(p => p.currency === currency);
    if (!price) {
      setError('找不到價格資訊');
      setCheckoutLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          priceId: price.id,
          successUrl: `${window.location.origin}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${window.location.origin}/planner`,
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || '建立付款失敗');
      }

      const { url } = await response.json();
      if (url) {
        window.location.href = url;
      }
    } catch (err: any) {
      console.error('Checkout error:', err);
      setError(err.message || '付款處理失敗');
    } finally {
      setCheckoutLoading(false);
    }
  };

  const handlePaymentSelect = (method: 'stripe' | 'payuni', currency: 'twd' | 'usd') => {
    if (selectedProduct) {
      if (method === 'stripe') {
        handleStripeCheckout(selectedProduct, currency);
      } else {
        setShowPaymentChoice(false);
        setSelectedProduct(null);
      }
    }
  };

  const getPlanIcon = (code?: string) => {
    switch (code) {
      case 'basic': return <MessageCircle className="w-6 h-6" />;
      case 'standard': return <Star className="w-6 h-6" />;
      case 'premium': return <Sparkles className="w-6 h-6" />;
      default: return <MessageCircle className="w-6 h-6" />;
    }
  };

  const getPlanColors = (code?: string) => {
    switch (code) {
      case 'basic': return 'from-blue-50 to-blue-100 border-blue-200';
      case 'standard': return 'from-amber-50 to-amber-100 border-amber-200';
      case 'premium': return 'from-purple-50 to-purple-100 border-purple-200';
      default: return 'from-gray-50 to-gray-100 border-gray-200';
    }
  };

  const formatPrice = (amount: number, currency: string) => {
    if (currency === 'twd') {
      return `NT$${(amount / 100).toLocaleString()}`;
    }
    return `$${(amount / 100).toFixed(0)} USD`;
  };

  const getPrice = (product: StripeProduct, currency: 'twd' | 'usd') => {
    return product.prices.find(p => p.currency === currency);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-8 h-8 animate-spin text-amber-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <p className="text-red-500 mb-4">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700"
        >
          重試
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-stone-800 mb-2">旅程策劃服務</h2>
        <p className="text-stone-600">專業策劃師為您量身打造完美旅程</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {products.map((product, index) => {
          const code = product.metadata?.code;
          const twdPrice = getPrice(product, 'twd');
          const usdPrice = getPrice(product, 'usd');
          const features = PLAN_FEATURES[code || ''] || [];

          return (
            <motion.div
              key={product.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className={`relative bg-gradient-to-b ${getPlanColors(code)} border-2 rounded-2xl p-6 cursor-pointer hover:shadow-lg transition-all`}
              onClick={() => handleSelectPlan(product)}
              data-testid={`plan-card-${code}`}
            >
              {code === 'standard' && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber-500 text-white px-3 py-1 rounded-full text-xs font-bold">
                  最受歡迎
                </div>
              )}

              <div className="flex items-center gap-3 mb-4">
                <div className={`p-2 rounded-xl ${code === 'premium' ? 'bg-purple-200' : code === 'standard' ? 'bg-amber-200' : 'bg-blue-200'}`}>
                  {getPlanIcon(code)}
                </div>
                <div>
                  <h3 className="font-bold text-lg text-stone-800">{product.name}</h3>
                  <p className="text-sm text-stone-500">{product.metadata?.nameEn}</p>
                </div>
              </div>

              <p className="text-sm text-stone-600 mb-4">{product.description}</p>

              <div className="flex items-baseline gap-1 mb-4">
                {twdPrice && (
                  <span className="text-3xl font-bold text-stone-800">
                    {formatPrice(twdPrice.unit_amount, 'twd')}
                  </span>
                )}
                {usdPrice && (
                  <span className="text-sm text-stone-500">
                    / {formatPrice(usdPrice.unit_amount, 'usd')}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 text-sm text-stone-600 mb-4">
                <Clock className="w-4 h-4" />
                <span>{product.metadata?.durationDays || '7'} 天服務期間</span>
              </div>

              <ul className="space-y-2 mb-6">
                {features.map((feature, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-stone-700">
                    <Check className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <button 
                className={`w-full py-3 rounded-xl font-medium transition-colors ${
                  code === 'premium' 
                    ? 'bg-purple-600 hover:bg-purple-700 text-white'
                    : code === 'standard'
                    ? 'bg-amber-600 hover:bg-amber-700 text-white'
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
                data-testid={`select-plan-${code}`}
              >
                選擇此方案
              </button>
            </motion.div>
          );
        })}
      </div>

      {showPaymentChoice && selectedProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-2xl p-6 max-w-sm w-full"
          >
            <h3 className="text-lg font-bold text-stone-800 mb-4">選擇付款方式</h3>
            <p className="text-sm text-stone-600 mb-6">
              已選擇：{selectedProduct.name}
            </p>

            <div className="space-y-3">
              {getPrice(selectedProduct, 'twd') && (
                <button
                  onClick={() => handlePaymentSelect('stripe', 'twd')}
                  disabled={checkoutLoading}
                  className="w-full p-4 border-2 border-stone-200 rounded-xl hover:border-amber-400 hover:bg-amber-50 transition-colors text-left disabled:opacity-50"
                  data-testid="payment-twd"
                >
                  <div className="font-medium text-stone-800 flex items-center gap-2">
                    台幣付款 (Stripe)
                    {checkoutLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  </div>
                  <div className="text-sm text-stone-500">
                    {formatPrice(getPrice(selectedProduct, 'twd')!.unit_amount, 'twd')}
                  </div>
                </button>
              )}

              {getPrice(selectedProduct, 'usd') && (
                <button
                  onClick={() => handlePaymentSelect('stripe', 'usd')}
                  disabled={checkoutLoading}
                  className="w-full p-4 border-2 border-stone-200 rounded-xl hover:border-blue-400 hover:bg-blue-50 transition-colors text-left disabled:opacity-50"
                  data-testid="payment-usd"
                >
                  <div className="font-medium text-stone-800 flex items-center gap-2">
                    國際信用卡 (Stripe USD)
                    {checkoutLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  </div>
                  <div className="text-sm text-stone-500">
                    {formatPrice(getPrice(selectedProduct, 'usd')!.unit_amount, 'usd')}
                  </div>
                </button>
              )}
            </div>

            <button
              onClick={() => {
                setShowPaymentChoice(false);
                setSelectedProduct(null);
              }}
              disabled={checkoutLoading}
              className="w-full mt-4 py-2 text-stone-500 hover:text-stone-700 disabled:opacity-50"
              data-testid="cancel-payment"
            >
              取消
            </button>
          </motion.div>
        </div>
      )}
    </div>
  );
};
