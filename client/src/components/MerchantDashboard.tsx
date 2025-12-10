import React, { useState } from 'react';
import { Merchant, AppState, PlanTier, Rarity } from '../types';
import { SUBSCRIPTION_PLANS, TRANSLATIONS } from '../constants';
import { Store, CheckCircle, Plus, ShieldCheck, Crown, Sparkles } from 'lucide-react';


interface MerchantDashboardProps {
  state: AppState;
  onLogin: (name: string, email: string) => void;
  onUpdateMerchant: (merchant: Merchant) => void;
  onClaim: (item: any) => void;
}

export const MerchantDashboard: React.FC<MerchantDashboardProps> = ({ state, onLogin, onUpdateMerchant }) => {
  const [name, setName] = useState('');
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const t = TRANSLATIONS[state.language] as any;

  const handleUpgradeToPremium = async () => {
    setIsCheckingOut(true);
    
    try {
      const response = await fetch('/api/checkout/create-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          customerEmail: state.currentMerchant?.email
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Checkout failed');
      }

      window.location.href = data.url;
    } catch (error: any) {
      console.error('Checkout error:', error);
      alert('Payment error: ' + (error.message || 'Please try again'));
      setIsCheckingOut(false);
    }
  };

  if (!state.currentMerchant) {
    return (
      <div className="p-8 max-w-md mx-auto mt-20 bg-white rounded-3xl shadow-xl">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <Store className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-black text-slate-800">{t.merchantLogin}</h2>
        </div>
        
        <form onSubmit={(e) => { e.preventDefault(); onLogin(name, ''); }} className="space-y-4">
          <input 
            type="text" 
            placeholder={t.merchantName || t.storeName} 
            value={name} 
            onChange={(e) => setName(e.target.value)} 
            className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none" 
            data-testid="input-merchant-name" 
          />
          <button 
            type="submit"
            className="w-full py-4 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:from-indigo-600 hover:to-purple-600 transition-colors shadow-lg"
            data-testid="button-merchant-submit"
          >
            <Store className="w-5 h-5" />
            {t.login}
          </button>
        </form>
        
        <button 
          onClick={() => window.location.href = '/'}
          className="w-full mt-3 py-3 text-slate-500 text-sm hover:bg-slate-50 rounded-xl"
          data-testid="button-back-home"
        >
          {t.back || t.backToHome}
        </button>
      </div>
    );
  }

  // Dashboard View
  const merchant = state.currentMerchant;
  const plan = merchant ? SUBSCRIPTION_PLANS[merchant.subscriptionPlan] : SUBSCRIPTION_PLANS.free;
  const isPremium = merchant?.subscriptionPlan === 'premium';

  return (
    <div className="pb-32 max-w-md mx-auto pt-20 px-4">
      <div className={`${isPremium ? 'bg-gradient-to-br from-amber-500 to-orange-600' : 'bg-slate-900'} text-white rounded-3xl p-6 mb-6 relative overflow-hidden`}>
        {isPremium && (
          <div className="absolute top-0 right-0 w-32 h-32 opacity-20">
            <Crown className="w-full h-full" />
          </div>
        )}
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center">
              {isPremium ? <Crown className="w-6 h-6" /> : <Store className="w-6 h-6" />}
            </div>
            <div>
              <h2 className="font-bold text-lg">{merchant?.name}</h2>
              <div className={`inline-flex items-center gap-1 ${isPremium ? 'bg-white/20' : 'bg-indigo-500'} px-2 py-0.5 rounded text-xs font-bold`}>
                 <ShieldCheck className="w-3 h-3" />
                 {plan.name}
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-3 mt-6">
            <div className="bg-white/10 rounded-xl p-3">
               <div className="text-2xl font-black">0</div>
               <div className="text-[10px] opacity-60 uppercase">{t.impressions}</div>
            </div>
            <div className="bg-white/10 rounded-xl p-3">
               <div className="text-2xl font-black">0</div>
               <div className="text-[10px] opacity-60 uppercase">{t.redeems}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="font-black text-slate-800 text-lg">{t.activeCoupons}</h3>
        
        <button 
          className="w-full py-4 border-2 border-dashed border-slate-300 rounded-2xl text-slate-400 font-bold flex items-center justify-center gap-2 hover:bg-slate-50 hover:border-indigo-300 hover:text-indigo-500 transition-colors"
          data-testid="button-create-campaign"
        >
          <Plus className="w-5 h-5" />
          {t.createCampaign}
        </button>

        {/* Upgrade Callout - only show for free users */}
        {merchant?.subscriptionPlan === 'free' && (
           <div className="bg-gradient-to-r from-amber-100 to-orange-100 p-6 rounded-3xl mt-8 border border-amber-200">
             <div className="flex items-center gap-2 mb-3">
               <Sparkles className="w-6 h-6 text-amber-600" />
               <h3 className="font-black text-amber-900 text-xl">{t.upgradeTitle}</h3>
             </div>
             <ul className="space-y-2 mb-5">
               <li className="flex items-center gap-2 text-amber-800 text-sm font-bold">
                 <CheckCircle className="w-4 h-4 text-amber-600" /> {t.benefitRarity}
               </li>
               <li className="flex items-center gap-2 text-amber-800 text-sm font-bold">
                 <CheckCircle className="w-4 h-4 text-amber-600" /> {t.benefitSlots}
               </li>
               <li className="flex items-center gap-2 text-amber-800 text-sm font-bold">
                 <CheckCircle className="w-4 h-4 text-amber-600" /> {t.benefitSSR}
               </li>
               <li className="flex items-center gap-2 text-amber-800 text-sm font-bold">
                 <CheckCircle className="w-4 h-4 text-amber-600" /> {t.benefitUnlimited}
               </li>
             </ul>
             <button 
               onClick={handleUpgradeToPremium}
               disabled={isCheckingOut}
               className="w-full py-4 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-black rounded-xl hover:from-amber-600 hover:to-orange-600 transition-all shadow-lg shadow-amber-200 disabled:opacity-50 flex items-center justify-center gap-2"
               data-testid="button-upgrade-premium"
             >
               {isCheckingOut ? (
                 <>
                   <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                   {t.processing}
                 </>
               ) : (
                 <>
                   <Crown className="w-5 h-5" />
                   {t.upgradePremium}
                 </>
               )}
             </button>
           </div>
        )}

        {/* Premium Badge */}
        {isPremium && (
          <div className="bg-gradient-to-r from-amber-50 to-orange-50 p-4 rounded-2xl border border-amber-200 flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full flex items-center justify-center">
              <Crown className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="font-bold text-amber-900">{t.premiumMember}</div>
              <div className="text-xs text-amber-700">{t.premiumDesc}</div>
            </div>
          </div>
        )}
      </div>

    </div>
  );
};
