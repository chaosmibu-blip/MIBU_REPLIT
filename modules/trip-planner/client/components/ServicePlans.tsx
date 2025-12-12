import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Check, Star, Sparkles, MessageCircle, Clock, Loader2 } from 'lucide-react';

interface ServicePlan {
  id: number;
  code: string;
  nameZh: string;
  nameEn: string;
  description: string | null;
  features: string[] | null;
  priceNtd: number;
  priceUsd: number | null;
  durationDays: number | null;
  maxMessages: number | null;
}

interface ServicePlansProps {
  onSelectPlan: (plan: ServicePlan, paymentMethod: 'stripe' | 'payuni') => void;
  isAuthenticated: boolean;
  onLoginRequired: () => void;
}

export const ServicePlans: React.FC<ServicePlansProps> = ({ 
  onSelectPlan, 
  isAuthenticated,
  onLoginRequired 
}) => {
  const [plans, setPlans] = useState<ServicePlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<ServicePlan | null>(null);
  const [showPaymentChoice, setShowPaymentChoice] = useState(false);

  useEffect(() => {
    fetch('/api/planner/service-plans')
      .then(res => {
        if (!res.ok) throw new Error('載入失敗');
        return res.json();
      })
      .then(data => {
        setPlans(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Error loading plans:', err);
        setError('無法載入服務方案，請稍後再試');
        setLoading(false);
      });
  }, []);

  const handleSelectPlan = (plan: ServicePlan) => {
    if (!isAuthenticated) {
      onLoginRequired();
      return;
    }
    setSelectedPlan(plan);
    setShowPaymentChoice(true);
  };

  const handlePaymentSelect = (method: 'stripe' | 'payuni') => {
    if (selectedPlan) {
      onSelectPlan(selectedPlan, method);
      setShowPaymentChoice(false);
      setSelectedPlan(null);
    }
  };

  const getPlanIcon = (code: string) => {
    switch (code) {
      case 'basic': return <MessageCircle className="w-6 h-6" />;
      case 'standard': return <Star className="w-6 h-6" />;
      case 'premium': return <Sparkles className="w-6 h-6" />;
      default: return <MessageCircle className="w-6 h-6" />;
    }
  };

  const getPlanColors = (code: string) => {
    switch (code) {
      case 'basic': return 'from-blue-50 to-blue-100 border-blue-200';
      case 'standard': return 'from-amber-50 to-amber-100 border-amber-200';
      case 'premium': return 'from-purple-50 to-purple-100 border-purple-200';
      default: return 'from-gray-50 to-gray-100 border-gray-200';
    }
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
        {plans.map((plan, index) => (
          <motion.div
            key={plan.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className={`relative bg-gradient-to-b ${getPlanColors(plan.code)} border-2 rounded-2xl p-6 cursor-pointer hover:shadow-lg transition-all`}
            onClick={() => handleSelectPlan(plan)}
            data-testid={`plan-card-${plan.code}`}
          >
            {plan.code === 'standard' && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber-500 text-white px-3 py-1 rounded-full text-xs font-bold">
                最受歡迎
              </div>
            )}

            <div className="flex items-center gap-3 mb-4">
              <div className={`p-2 rounded-xl ${plan.code === 'premium' ? 'bg-purple-200' : plan.code === 'standard' ? 'bg-amber-200' : 'bg-blue-200'}`}>
                {getPlanIcon(plan.code)}
              </div>
              <div>
                <h3 className="font-bold text-lg text-stone-800">{plan.nameZh}</h3>
                <p className="text-sm text-stone-500">{plan.nameEn}</p>
              </div>
            </div>

            <p className="text-sm text-stone-600 mb-4">{plan.description}</p>

            <div className="flex items-baseline gap-1 mb-4">
              <span className="text-3xl font-bold text-stone-800">NT${plan.priceNtd}</span>
              {plan.priceUsd && (
                <span className="text-sm text-stone-500">/ ${plan.priceUsd} USD</span>
              )}
            </div>

            <div className="flex items-center gap-2 text-sm text-stone-600 mb-4">
              <Clock className="w-4 h-4" />
              <span>{plan.durationDays} 天服務期間</span>
            </div>

            <ul className="space-y-2 mb-6">
              {plan.features?.map((feature, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-stone-700">
                  <Check className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>

            <button 
              className={`w-full py-3 rounded-xl font-medium transition-colors ${
                plan.code === 'premium' 
                  ? 'bg-purple-600 hover:bg-purple-700 text-white'
                  : plan.code === 'standard'
                  ? 'bg-amber-600 hover:bg-amber-700 text-white'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
              data-testid={`select-plan-${plan.code}`}
            >
              選擇此方案
            </button>
          </motion.div>
        ))}
      </div>

      {showPaymentChoice && selectedPlan && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-2xl p-6 max-w-sm w-full"
          >
            <h3 className="text-lg font-bold text-stone-800 mb-4">選擇付款方式</h3>
            <p className="text-sm text-stone-600 mb-6">
              已選擇：{selectedPlan.nameZh}
            </p>

            <div className="space-y-3">
              <button
                onClick={() => handlePaymentSelect('payuni')}
                className="w-full p-4 border-2 border-stone-200 rounded-xl hover:border-amber-400 hover:bg-amber-50 transition-colors text-left"
                data-testid="payment-payuni"
              >
                <div className="font-medium text-stone-800">台灣金流 (PAYUNi)</div>
                <div className="text-sm text-stone-500">NT${selectedPlan.priceNtd}</div>
              </button>

              {selectedPlan.priceUsd && (
                <button
                  onClick={() => handlePaymentSelect('stripe')}
                  className="w-full p-4 border-2 border-stone-200 rounded-xl hover:border-blue-400 hover:bg-blue-50 transition-colors text-left"
                  data-testid="payment-stripe"
                >
                  <div className="font-medium text-stone-800">國際信用卡 (Stripe)</div>
                  <div className="text-sm text-stone-500">${selectedPlan.priceUsd} USD</div>
                </button>
              )}
            </div>

            <button
              onClick={() => {
                setShowPaymentChoice(false);
                setSelectedPlan(null);
              }}
              className="w-full mt-4 py-2 text-stone-500 hover:text-stone-700"
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
