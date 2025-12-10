import React, { useState, useEffect } from 'react';
import { generateGachaItinerary } from './services/geminiService';
import { useAuth } from './hooks/useAuth';
import { AppState, Language, GachaItem, AppView, Merchant } from './types';
import { InputForm } from './components/InputForm';
import { GachaScene } from './components/GachaScene';
import { ResultList } from './components/ResultList';
import { CollectionGrid } from './components/CollectionGrid';
import { ItemBox } from './components/ItemBox';
import { BottomNav } from './components/BottomNav';
import { CouponCelebration } from './components/CouponCelebration';
import { MerchantDashboard } from './components/MerchantDashboard';
import { DEFAULT_LEVEL, TRANSLATIONS, MAX_DAILY_GENERATIONS } from './constants';
import { Globe, LogIn, LogOut } from 'lucide-react';

const STORAGE_KEYS = {
  COLLECTION: 'travel_gacha_collection',
  LAST_COLLECTION_VISIT: 'mibu_last_visit_collection',
  LAST_BOX_VISIT: 'mibu_last_visit_itembox',
  MERCHANT_DB: 'mibu_merchant_db',
  MERCHANT_PROFILE: 'mibu_merchant_profile_v3', 
  DAILY_LIMIT: 'mibu_daily_limit'
};

const App: React.FC = () => {
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  
  const [state, setState] = useState<AppState>({
    language: 'zh-TW', user: null, country: '', city: '', level: DEFAULT_LEVEL,
    loading: false, result: null, error: null, groundingSources: [], view: 'home',
    collection: [], celebrationCoupons: [], 
    lastVisitCollection: new Date().toISOString(), lastVisitItemBox: new Date().toISOString(),
    merchantDb: {}, currentMerchant: null
  });

  const [showLangMenu, setShowLangMenu] = useState(false);

  const t = TRANSLATIONS[state.language] as any;

  // Sync Replit Auth user to state
  useEffect(() => {
    if (user) {
      setState(prev => ({
        ...prev,
        user: {
          id: user.id,
          name: user.firstName || user.email || 'User',
          email: user.email,
          avatar: user.profileImageUrl,
        }
      }));
    }
  }, [user]);

  // Load user collections when authenticated
  useEffect(() => {
    const loadCollections = async () => {
      if (isAuthenticated && user?.id) {
        try {
          const response = await fetch('/api/collections');
          if (response.ok) {
            const data = await response.json();
            setState(prev => ({ ...prev, collection: data.collections || [] }));
          }
        } catch (error) {
          console.error('Failed to load collections:', error);
          // Fall back to localStorage
          const savedCollection = localStorage.getItem(STORAGE_KEYS.COLLECTION);
          if (savedCollection) {
            try {
              const parsed = JSON.parse(savedCollection);
              if (Array.isArray(parsed)) {
                const validItems = parsed.filter(i => i && typeof i === 'object' && i.place_name);
                setState(prev => ({ ...prev, collection: validItems }));
              }
            } catch (e) {}
          }
        }
      }
    };
    
    loadCollections();
  }, [isAuthenticated, user?.id]);

  // Load other persisted data
  useEffect(() => {
    try {
      const savedMerchant = localStorage.getItem(STORAGE_KEYS.MERCHANT_PROFILE);
      if (savedMerchant) setState(prev => ({ ...prev, currentMerchant: JSON.parse(savedMerchant) }));

      const lastCol = localStorage.getItem(STORAGE_KEYS.LAST_COLLECTION_VISIT);
      const lastBox = localStorage.getItem(STORAGE_KEYS.LAST_BOX_VISIT);
      if (lastCol) setState(prev => ({ ...prev, lastVisitCollection: lastCol }));
      if (lastBox) setState(prev => ({ ...prev, lastVisitItemBox: lastBox }));

      const savedMerchantDb = localStorage.getItem(STORAGE_KEYS.MERCHANT_DB);
      if (savedMerchantDb) setState(prev => ({ ...prev, merchantDb: JSON.parse(savedMerchantDb) }));
      
      // Load local collection for non-authenticated users
      if (!isAuthenticated) {
        const savedCollection = localStorage.getItem(STORAGE_KEYS.COLLECTION);
        if (savedCollection) {
          const parsed = JSON.parse(savedCollection);
          if (Array.isArray(parsed)) {
            const validItems = parsed.filter(i => i && typeof i === 'object' && i.place_name);
            setState(prev => ({ ...prev, collection: validItems }));
          }
        }
      }
    } catch (e) { 
      console.error("Persistence Error", e); 
    }
  }, [isAuthenticated]);

  useEffect(() => {
    const checkPaymentStatus = async () => {
      const params = new URLSearchParams(window.location.search);
      const isPaymentSuccess = params.get('payment_success');
      const sessionId = params.get('session_id');

      if (isPaymentSuccess && sessionId) {
        window.history.replaceState({}, document.title, window.location.pathname);

        try {
          const response = await fetch(`/api/verify-session?session_id=${sessionId}`);
          const data = await response.json();

          if (data.success) {
             alert(TRANSLATIONS[state.language].paymentSuccess);
             
             const savedMerchantStr = localStorage.getItem(STORAGE_KEYS.MERCHANT_PROFILE);
             if (savedMerchantStr) {
                 const merchant = JSON.parse(savedMerchantStr);
                 merchant.subscriptionPlan = 'premium';
                 localStorage.setItem(STORAGE_KEYS.MERCHANT_PROFILE, JSON.stringify(merchant));
                 setState(prev => ({ ...prev, currentMerchant: merchant, view: 'merchant_dashboard' }));
             }
          } else {
             console.warn('Payment verification failed:', data.status);
          }
        } catch (e) {
          console.error('Failed to verify payment', e);
        }
      }
    };

    checkPaymentStatus();
  }, [state.language]);

  const getItemKey = (item: GachaItem): string => {
    try {
      if (!item) return `unknown-${Math.random()}`;
      let nameStr = typeof item.place_name === 'string' ? item.place_name : (item.place_name as any)['en'] || (item.place_name as any)['zh-TW'] || 'unknown';
      return `${nameStr}-${item.city || 'city'}`;
    } catch (e) { return `error-${Math.random()}`; }
  };

  const getPlaceId = (item: GachaItem): string => {
      const raw = item.place_name as any;
      if (typeof raw === 'string') return raw;
      return raw['en'] || raw['zh-TW'] || 'unknown';
  };

  const handleMerchantLoginStart = () => setState(prev => ({ ...prev, view: 'merchant_login' }));

  const handleMerchantLogin = (name: string, email: string) => {
      if (state.currentMerchant && state.currentMerchant.name === name) {
          setState(prev => ({ ...prev, user: { name, email, avatar: '', isMerchant: true }, view: 'merchant_dashboard' }));
          return;
      }
      const merchantId = `merchant-${name.toLowerCase().replace(/\s/g, '-')}`;
      const claimedNames = Object.keys(state.merchantDb).filter(key => state.merchantDb[key].merchant_id === merchantId);
      const merchant: Merchant = { id: merchantId, name, email, claimedPlaceNames: claimedNames, subscriptionPlan: 'free' };
      localStorage.setItem(STORAGE_KEYS.MERCHANT_PROFILE, JSON.stringify(merchant));
      setState(prev => ({ ...prev, user: { name, email, avatar: '', isMerchant: true }, currentMerchant: merchant, view: 'merchant_dashboard' }));
  };

  const handleMerchantUpdate = (updatedMerchant: Merchant) => {
      localStorage.setItem(STORAGE_KEYS.MERCHANT_PROFILE, JSON.stringify(updatedMerchant));
      setState(prev => ({ ...prev, currentMerchant: updatedMerchant }));
  };

  const handleMerchantClaim = (item: GachaItem) => {
      if (!state.currentMerchant) return;
      const placeId = getPlaceId(item);
      const claimedItem: GachaItem = { ...item, merchant_id: state.currentMerchant.id, remaining_coupons: 0, is_coupon: false, coupon_data: null, impressionCount: 0, redemptionCount: 0, merchant_coupons: [] };
      const newDb = { ...state.merchantDb, [placeId]: claimedItem };
      const newMerchant = { ...state.currentMerchant, claimedPlaceNames: [...state.currentMerchant.claimedPlaceNames, placeId] };
      handleMerchantUpdate(newMerchant);
      setState(prev => ({ ...prev, merchantDb: newDb }));
      localStorage.setItem(STORAGE_KEYS.MERCHANT_DB, JSON.stringify(newDb));
  };

  const handleMerchantUpdateItem = (item: GachaItem) => {
      const placeId = getPlaceId(item);
      const newDb = { ...state.merchantDb, [placeId]: item };
      setState(prev => ({ ...prev, merchantDb: newDb }));
      localStorage.setItem(STORAGE_KEYS.MERCHANT_DB, JSON.stringify(newDb));
  };

  const handlePull = async () => {
    let isUnlimitedUser = false;
    if (isAuthenticated) {
      try {
        const res = await fetch('/api/auth/privileges');
        if (res.ok) {
          const data = await res.json();
          isUnlimitedUser = data.hasUnlimitedGeneration || false;
        }
      } catch (e) {}
    }
    
    const today = new Date().toISOString().split('T')[0];
    const rawLimit = localStorage.getItem(STORAGE_KEYS.DAILY_LIMIT);
    let currentCount = 0;
    if (rawLimit) { try { const parsed = JSON.parse(rawLimit); if (parsed.date === today) currentCount = parsed.count; } catch (e) {} }
    if (!isUnlimitedUser && currentCount >= MAX_DAILY_GENERATIONS) { alert(`${t.dailyLimitReached}\n${t.dailyLimitReachedDesc}`); return; }

    setState(prev => ({ ...prev, loading: true, error: null, celebrationCoupons: [] }));
    try {
      const collectedNames = state.collection.filter(i => i && i.place_name).map(item => item.place_name as string);
      const { data, sources } = await generateGachaItinerary(state.country, state.city, state.level, state.language, collectedNames);
      localStorage.setItem(STORAGE_KEYS.DAILY_LIMIT, JSON.stringify({ date: today, count: currentCount + 1 }));

      const updatedMerchantDb = { ...state.merchantDb };
      let dbUpdated = false;
      const processedInventory = data.inventory.map(item => {
          const placeId = getPlaceId(item);
          const merchantItem = updatedMerchantDb[placeId];
          let finalItem = { ...item, country: state.country, city: state.city }; 
          if (merchantItem) {
              merchantItem.impressionCount = (merchantItem.impressionCount || 0) + 1;
              dbUpdated = true;
              finalItem.store_promo = merchantItem.store_promo;
              finalItem.is_promo_active = merchantItem.is_promo_active;
              if (merchantItem.rarity) finalItem.rarity = merchantItem.rarity;
              const activeCoupons = (merchantItem.merchant_coupons || []).filter(c => c.is_active && !c.archived && c.remaining_quantity > 0);
              if (activeCoupons.length > 0) {
                   const winner = activeCoupons[Math.floor(Math.random() * activeCoupons.length)];
                   finalItem.is_coupon = true;
                   finalItem.coupon_data = { title: winner.title, code: winner.code, terms: winner.terms };
                   finalItem.rarity = winner.rarity;
                   merchantItem.redemptionCount = (merchantItem.redemptionCount || 0) + 1;
                   winner.redeemed_count = (winner.redeemed_count || 0) + 1;
                   winner.remaining_quantity--;
              } else { finalItem.is_coupon = false; finalItem.coupon_data = null; }
              updatedMerchantDb[placeId] = merchantItem;
          }
          return finalItem;
      });
      if (dbUpdated) localStorage.setItem(STORAGE_KEYS.MERCHANT_DB, JSON.stringify(updatedMerchantDb));

      const newItems = processedInventory.map(item => ({ ...item, collected_at: new Date().toISOString() }));
      const newCoupons = newItems.filter(item => item.is_coupon && item.coupon_data);

      setState(prev => {
        const existingKeys = new Set(prev.collection.map(getItemKey));
        const uniqueNewItems = newItems.filter(i => !existingKeys.has(getItemKey(i)));
        const updatedCollection = [...prev.collection, ...uniqueNewItems];
        localStorage.setItem(STORAGE_KEYS.COLLECTION, JSON.stringify(updatedCollection));
        
        // Save new items to backend if user is authenticated
        if (isAuthenticated) {
          uniqueNewItems.forEach(async (item) => {
            try {
              const placeName = typeof item.place_name === 'string' 
                ? item.place_name 
                : (item.place_name as any)['en'] || (item.place_name as any)['zh-TW'] || 'unknown';
              
              const description = typeof item.description === 'string'
                ? item.description
                : (item.description as any)['en'] || (item.description as any)['zh-TW'] || '';
              
              await fetch('/api/collections', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  placeName,
                  country: item.country || state.country,
                  city: item.city || state.city,
                  rarity: item.rarity,
                  category: item.category || null,
                  description,
                  isCoupon: item.is_coupon || false,
                  couponData: item.coupon_data || null,
                }),
              });
            } catch (error) {
              console.error('Failed to save item to backend:', error);
            }
          });
        }
        
        return {
          ...prev, loading: false, result: { ...data, inventory: processedInventory },
          groundingSources: sources, view: 'result', collection: updatedCollection,
          celebrationCoupons: newCoupons, merchantDb: dbUpdated ? updatedMerchantDb : prev.merchantDb
        };
      });
    } catch (err: any) {
      console.error(err);
      setState(prev => ({ ...prev, loading: false, error: err.message || "Connection Failed." }));
    }
  };

  const handleViewChange = (newView: AppView) => {
    const now = new Date().toISOString();
    if (newView === 'collection') { localStorage.setItem(STORAGE_KEYS.LAST_COLLECTION_VISIT, now); setState(prev => ({ ...prev, view: newView, lastVisitCollection: now })); }
    else if (newView === 'item_box') { localStorage.setItem(STORAGE_KEYS.LAST_BOX_VISIT, now); setState(prev => ({ ...prev, view: newView, lastVisitItemBox: now })); }
    else { setState(prev => ({ ...prev, view: (newView === 'home' && prev.result) ? 'result' : newView })); }
  };

  const handleLanguageChange = (lang: Language) => {
    setState(prev => ({ ...prev, language: lang }));
    setShowLangMenu(false);
  };

  const hasNewCollection = state.collection.some(i => i.collected_at && i.collected_at > state.lastVisitCollection);
  const hasNewItems = state.collection.some(i => i.is_coupon && i.collected_at && i.collected_at > state.lastVisitItemBox);

  // Show loading while auth is initializing
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">{t.loading || 'Loading...'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col font-sans relative bg-slate-50 text-slate-900 transition-colors duration-500 pb-20 select-none">
      <div className="fixed top-0 left-0 w-full h-96 bg-gradient-to-b from-indigo-50 to-transparent pointer-events-none -z-10"></div>
      
      {state.celebrationCoupons.length > 0 && <CouponCelebration items={state.celebrationCoupons} language={state.language} onClose={() => setState(p => ({ ...p, celebrationCoupons: [] }))} />}

      <nav className="sticky top-0 z-[999] px-6 pt-safe-top pb-4 flex justify-between items-center w-full glass-nav transition-all">
         <div className="flex items-center gap-2">
           <img src="/app-icon.jpg" alt="Mibu" className="w-8 h-8 rounded-lg object-cover" />
           <span className="font-display font-bold text-xl tracking-tight text-slate-800">MIBU</span>
         </div>
         
         <div className="flex items-center gap-3">
            {/* Language Switcher */}
            <div className="relative">
               <button onClick={() => setShowLangMenu(!showLangMenu)} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200 transition-colors" data-testid="button-language">
                  <Globe className="w-5 h-5 text-slate-600" />
               </button>
               {showLangMenu && (
                 <div className="absolute top-full right-0 mt-2 bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden w-32 py-1 flex flex-col z-50">
                    <button onClick={() => handleLanguageChange('zh-TW')} className="px-4 py-2 text-left hover:bg-slate-50 text-sm font-bold text-slate-700" data-testid="button-lang-zh">繁體中文</button>
                    <button onClick={() => handleLanguageChange('en')} className="px-4 py-2 text-left hover:bg-slate-50 text-sm font-bold text-slate-700" data-testid="button-lang-en">English</button>
                    <button onClick={() => handleLanguageChange('ja')} className="px-4 py-2 text-left hover:bg-slate-50 text-sm font-bold text-slate-700" data-testid="button-lang-ja">日本語</button>
                    <button onClick={() => handleLanguageChange('ko')} className="px-4 py-2 text-left hover:bg-slate-50 text-sm font-bold text-slate-700" data-testid="button-lang-ko">한국어</button>
                 </div>
               )}
            </div>

            {isAuthenticated && user ? (
                <a href="/api/logout" className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity" data-testid="button-logout">
                  <img 
                    src={user.profileImageUrl || `https://ui-avatars.com/api/?name=${user.firstName || 'U'}`} 
                    className="w-8 h-8 rounded-full border border-white shadow-sm object-cover" 
                    alt="User" 
                  />
                  <span className="text-xs font-bold text-slate-600 hidden sm:block">{user.firstName || user.email}</span>
                  <LogOut className="w-4 h-4 text-slate-400" />
                </a>
            ) : (
                <a 
                  href="/api/login"
                  className="flex items-center gap-2 text-xs font-bold bg-indigo-500 text-white px-4 py-2 rounded-full hover:bg-indigo-600 transition-colors"
                  data-testid="button-login"
                >
                  <LogIn className="w-4 h-4" />
                  {t.login}
                </a>
            )}
         </div>
      </nav>

      {state.loading && <GachaScene language={state.language} />}

      <main className="flex-1 w-full max-w-2xl mx-auto px-4 py-4">
        {state.view === 'home' && !state.result && (
          <InputForm 
            state={state}
            onUpdate={(updates) => setState(p => ({ ...p, ...updates }))}
            onSubmit={handlePull}
          />
        )}

        {state.view === 'result' && state.result && (
          <ResultList data={state.result} language={state.language} onResearch={handlePull} isLoading={state.loading} />
        )}

        {state.view === 'collection' && (
          <CollectionGrid items={state.collection} language={state.language} />
        )}

        {state.view === 'item_box' && (
          <ItemBox items={state.collection.filter(i => i.is_coupon)} language={state.language} />
        )}

        {state.view === 'merchant_login' && (
           <div className="flex flex-col items-center justify-center min-h-[60vh] p-6">
              <div className="w-full max-w-sm bg-white/80 backdrop-blur-lg rounded-2xl p-6 shadow-lg border border-white/50">
                 <h2 className="text-xl font-bold text-center mb-6">{t.merchantLogin}</h2>
                 <form onSubmit={(e) => { e.preventDefault(); const form = e.target as HTMLFormElement; handleMerchantLogin((form.elements.namedItem('name') as HTMLInputElement).value, (form.elements.namedItem('email') as HTMLInputElement).value); }}>
                    <input name="name" type="text" placeholder={t.merchantName} className="w-full px-4 py-3 rounded-xl border border-slate-200 mb-3 bg-white focus:ring-2 focus:ring-indigo-500 outline-none" required data-testid="input-merchant-name" />
                    <input name="email" type="email" placeholder={t.merchantEmail} className="w-full px-4 py-3 rounded-xl border border-slate-200 mb-4 bg-white focus:ring-2 focus:ring-indigo-500 outline-none" required data-testid="input-merchant-email" />
                    <button type="submit" className="w-full bg-indigo-500 text-white font-bold py-3 rounded-xl hover:bg-indigo-600 transition-colors" data-testid="button-merchant-submit">{t.login}</button>
                 </form>
                 <button onClick={() => setState(p => ({ ...p, view: 'home' }))} className="w-full mt-3 text-slate-500 text-sm hover:underline" data-testid="button-back-home">{t.backToHome}</button>
              </div>
           </div>
        )}

        {state.view === 'merchant_dashboard' && state.currentMerchant && (
          <MerchantDashboard 
            state={state}
            onLogin={handleMerchantLogin}
            onUpdateMerchant={handleMerchantUpdate}
            onClaim={handleMerchantClaim}
            isAuthenticated={isAuthenticated}
          />
        )}
      </main>

      <BottomNav 
        currentView={state.view} 
        onChange={handleViewChange}
        language={state.language}
      />
    </div>
  );
};

export default App;
