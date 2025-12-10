import React, { useState } from 'react';
import { Merchant, AppState, PlanTier, Rarity } from '../types';
import { SUBSCRIPTION_PLANS, TRANSLATIONS } from '../constants';
import { Store, CheckCircle, Upload, Plus, ShieldCheck } from 'lucide-react';
import { GoogleLoginButton } from './GoogleLoginButton';
import { ReplitLoginButton } from './ReplitLoginButton';

interface MerchantDashboardProps {
  state: AppState;
  onLogin: (name: string, email: string) => void;
  onUpdateMerchant: (merchant: Merchant) => void;
  onClaim: (item: any) => void; 
}

export const MerchantDashboard: React.FC<MerchantDashboardProps> = ({ state, onLogin }) => {
  const [name, setName] = useState('');
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [loadingReplit, setLoadingReplit] = useState(false);
  const t = TRANSLATIONS[state.language];

  const handleGoogleLogin = () => {
     setLoadingGoogle(true);
     setTimeout(() => {
        setLoadingGoogle(false);
        onLogin('Mibu Travel Store (Google)', 'merchant@google.com');
     }, 1500);
  };

  const handleReplitLogin = () => {
     setLoadingReplit(true);
     setTimeout(() => {
        setLoadingReplit(false);
        onLogin('Mibu Travel Store (Replit)', 'merchant@replit.com');
     }, 1500);
  };
  
  if (state.view === 'merchant_login') {
    return (
      <div className="p-8 max-w-md mx-auto mt-20 bg-white rounded-3xl shadow-xl">
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <Store className="w-10 h-10" />
          </div>
          <h2 className="text-2xl font-black text-slate-800">{t.merchantAccess}</h2>
          <p className="text-slate-500 text-sm">{t.manageStore}</p>
        </div>
        
        <div className="space-y-3">
          <ReplitLoginButton 
             text={t.signInReplit} 
             onClick={handleReplitLogin} 
             isLoading={loadingReplit}
          />
          
          <GoogleLoginButton 
             text={t.signInGoogle} 
             onClick={handleGoogleLogin} 
             isLoading={loadingGoogle}
          />
          
          <div className="relative flex py-2 items-center">
             <div className="flex-grow border-t border-slate-200"></div>
             <span className="flex-shrink mx-4 text-slate-400 text-xs font-bold uppercase">{t.or}</span>
             <div className="flex-grow border-t border-slate-200"></div>
          </div>

          <input
            type="text"
            placeholder={t.storeName}
            className="w-full p-4 bg-slate-50 rounded-xl font-bold"
            value={name}
            onChange={e => setName(e.target.value)}
          />
          <button
            onClick={() => onLogin(name, 'test@example.com')}
            className="w-full py-4 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800"
          >
            {t.enterDashboard}
          </button>
        </div>
      </div>
    );
  }

  // Dashboard View
  const merchant = state.currentMerchant;
  const plan = merchant ? SUBSCRIPTION_PLANS[merchant.subscriptionPlan] : SUBSCRIPTION_PLANS.free;

  return (
    <div className="pb-32 max-w-md mx-auto pt-20 px-4">
      <div className="bg-slate-900 text-white rounded-3xl p-6 mb-6 relative overflow-hidden">
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center">
              <Store className="w-6 h-6" />
            </div>
            <div>
              <h2 className="font-bold text-lg">{merchant?.name}</h2>
              <div className="inline-flex items-center gap-1 bg-indigo-500 px-2 py-0.5 rounded text-xs font-bold">
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
        
        <button className="w-full py-4 border-2 border-dashed border-slate-300 rounded-2xl text-slate-400 font-bold flex items-center justify-center gap-2 hover:bg-slate-50 hover:border-indigo-300 hover:text-indigo-500 transition-colors">
          <Plus className="w-5 h-5" />
          {t.createCampaign}
        </button>

        {/* Upgrade Callout */}
        {merchant?.subscriptionPlan === 'free' && (
           <div className="bg-gradient-to-r from-amber-200 to-orange-200 p-6 rounded-3xl mt-8">
             <h3 className="font-black text-amber-900 text-xl mb-2">{t.upgradeTitle}</h3>
             <ul className="space-y-2 mb-4">
               <li className="flex items-center gap-2 text-amber-800 text-sm font-bold">
                 <CheckCircle className="w-4 h-4" /> {t.benefitRarity}
               </li>
               <li className="flex items-center gap-2 text-amber-800 text-sm font-bold">
                 <CheckCircle className="w-4 h-4" /> {t.benefitSlots}
               </li>
             </ul>
             <button className="w-full py-3 bg-white/50 text-amber-900 font-black rounded-xl hover:bg-white/80">
               {t.viewPlans}
             </button>
           </div>
        )}
      </div>
    </div>
  );
};
