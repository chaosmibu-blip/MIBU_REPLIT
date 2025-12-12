import React, { useState, useEffect } from 'react';
import { useAuth } from './hooks/useAuth';
import { AppState, Language, GachaItem, GachaResponse, AppView, Merchant, GachaSubView, PlannerSubView, SettingsTab } from './types';
import { InputForm } from './components/InputForm';
import { GachaScene } from './components/GachaScene';
import { ResultList } from './components/ResultList';
import { CollectionGrid } from './components/CollectionGrid';
import { ItemBox } from './components/ItemBox';
import { SideNav } from './components/SideNav';
import { ModuleHeader, GachaModuleNav, PlannerModuleNav } from './components/ModuleNav';
import { CouponCelebration } from './components/CouponCelebration';
import { MerchantDashboard } from './components/MerchantDashboard';
import { TripPlanner } from '../../modules/trip-planner/client';
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
    language: 'zh-TW', user: null, country: '', city: '', countryId: null, regionId: null, level: DEFAULT_LEVEL,
    loading: false, result: null, error: null, groundingSources: [], view: 'mibu_home',
    collection: [], celebrationCoupons: [], 
    lastVisitCollection: new Date().toISOString(), lastVisitItemBox: new Date().toISOString(),
    merchantDb: {}, currentMerchant: null
  });

  const [showLangMenu, setShowLangMenu] = useState(false);
  const [gachaSubView, setGachaSubViewRaw] = useState<GachaSubView>('gacha');
  const [plannerSubView, setPlannerSubView] = useState<PlannerSubView>('itinerary');
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('mibu');

  const setGachaSubView = (subView: GachaSubView) => {
    setGachaSubViewRaw(subView);
    const now = new Date().toISOString();
    if (subView === 'collection') {
      localStorage.setItem(STORAGE_KEYS.LAST_COLLECTION_VISIT, now);
      setState(prev => ({ ...prev, lastVisitCollection: now }));
    } else if (subView === 'itembox') {
      localStorage.setItem(STORAGE_KEYS.LAST_BOX_VISIT, now);
      setState(prev => ({ ...prev, lastVisitItemBox: now }));
    }
  };

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

  const handleMerchantLogin = async (name: string, email: string) => {
      // If authenticated, use backend registration
      if (isAuthenticated) {
        try {
          const response = await fetch('/api/merchant/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ name, email })
          });
          
          if (response.ok) {
            const data = await response.json();
            if (data.merchant) {
              const merchant: Merchant = {
                id: `merchant-${data.merchant.id}`,
                name: data.merchant.name,
                email: data.merchant.email,
                claimedPlaceNames: [],
                subscriptionPlan: data.merchant.subscriptionPlan || 'free'
              };
              localStorage.setItem(STORAGE_KEYS.MERCHANT_PROFILE, JSON.stringify(merchant));
              setState(prev => ({ ...prev, currentMerchant: merchant, view: 'merchant_dashboard' }));
              return;
            }
          }
        } catch (error) {
          console.error('Failed to register merchant:', error);
        }
      }
      
      // Fallback for unauthenticated (should not happen with new flow)
      setState(prev => ({ ...prev, view: 'merchant_dashboard' }));
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
      if (!state.countryId) {
        throw new Error('Please select a destination');
      }
      
      // Use the new itinerary endpoint that generates multiple categories for ONE district
      const response = await fetch('/api/gacha/itinerary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          countryId: state.countryId, 
          regionId: state.regionId,
          language: state.language,
          itemCount: state.level  // Use level to determine how many items
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to generate itinerary');
      }
      
      const result = await response.json();
      const { itinerary } = result;
      
      // Convert API response to GachaItem format and sort (stay/lodging last)
      const rawItems: GachaItem[] = itinerary.items.map((item: any, index: number) => ({
        id: Date.now() + index,
        place_name: item.place?.name || `${itinerary.location.district.name} ${item.subcategory.name}`,
        description: `${itinerary.location.region.name} ${itinerary.location.district.name}`,
        ai_description: item.place?.description || '',
        category: item.category.code as any,
        suggested_time: '',
        duration: '',
        search_query: '',
        color_hex: item.category.colorHex || '#6366f1',
        country: itinerary.location.country.name,
        city: itinerary.location.region.name,
        district: itinerary.location.district.name,  // ALL items share the SAME district
        collectedAt: new Date().toISOString(),
        is_coupon: false,
        coupon_data: null,
        place_id: item.place?.placeId || null,
        verified_name: item.place?.name || null,
        verified_address: item.place?.address || null,
        google_rating: item.place?.rating || null,
        google_types: item.place?.googleTypes || [],
        primary_type: item.place?.primaryType || null,
        location: item.place?.location || null,
        is_location_verified: item.isVerified || false
      }));
      
      // Sort items: put "stay" category at the end
      const allItems = rawItems.sort((a, b) => {
        const catA = String(a.category).toLowerCase();
        const catB = String(b.category).toLowerCase();
        const aIsStay = catA === 'stay';
        const bIsStay = catB === 'stay';
        if (aIsStay && !bIsStay) return 1;
        if (!aIsStay && bIsStay) return -1;
        return 0;
      });
      
      localStorage.setItem(STORAGE_KEYS.DAILY_LIMIT, JSON.stringify({ date: today, count: currentCount + 1 }));
      
      const gachaResponse: GachaResponse = {
        status: 'success',
        meta: {
          date: new Date().toISOString().split('T')[0],
          country: itinerary.location.country.name,
          city: itinerary.location.region.name,
          locked_district: itinerary.location.district.name,  // Display locked district
          user_level: state.level
        },
        inventory: allItems
      };

      setState(prev => {
        const existingKeys = new Set(prev.collection.map(getItemKey));
        const uniqueNewItems = allItems.filter(i => !existingKeys.has(getItemKey(i)));
        const updatedCollection = [...prev.collection, ...uniqueNewItems];
        localStorage.setItem(STORAGE_KEYS.COLLECTION, JSON.stringify(updatedCollection));
        
        if (isAuthenticated && uniqueNewItems.length > 0) {
          uniqueNewItems.forEach(async (item) => {
            try {
              const placeName = typeof item.place_name === 'string' 
                ? item.place_name 
                : (item.place_name as any)['en'] || (item.place_name as any)['zh-TW'] || 'unknown';
              
              // Prefer ai_description for meaningful content
              const aiDesc = item.ai_description;
              const description = aiDesc
                ? (typeof aiDesc === 'string' ? aiDesc : (aiDesc as any)['en'] || (aiDesc as any)['zh-TW'] || '')
                : (typeof item.description === 'string' ? item.description : (item.description as any)['en'] || (item.description as any)['zh-TW'] || '');
              
              await fetch('/api/collections', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  placeName,
                  country: item.country,
                  city: item.city,
                  district: item.district || null,
                  category: item.category || null,
                  subcategory: (item as any).subcategory || null,
                  description,
                  address: item.verified_address || null,
                  placeId: item.place_id || null,
                  rating: item.google_rating?.toString() || null,
                  locationLat: item.location?.lat?.toString() || null,
                  locationLng: item.location?.lng?.toString() || null,
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
          ...prev, 
          loading: false, 
          result: gachaResponse,
          groundingSources: [], 
          view: 'result', 
          collection: updatedCollection,
          celebrationCoupons: []
        };
      });
    } catch (err: any) {
      console.error(err);
      setState(prev => ({ ...prev, loading: false, error: err.message || "Connection Failed." }));
    }
  };

  const handleViewChange = (newView: AppView) => {
    if (newView === 'gacha_module') { setGachaSubViewRaw('gacha'); setState(prev => ({ ...prev, view: newView })); }
    else if (newView === 'planner_module') { setPlannerSubView('itinerary'); setState(prev => ({ ...prev, view: newView })); }
    else { setState(prev => ({ ...prev, view: newView })); }
  };

  const handleBackToHome = () => {
    setState(prev => ({ ...prev, view: 'mibu_home', result: null }));
  };

  const isInGachaModule = ['gacha_module', 'result', 'merchant_login', 'merchant_dashboard'].includes(state.view);
  const isInPlannerModule = state.view === 'planner_module';

  const handleLanguageChange = (lang: Language) => {
    setState(prev => ({ ...prev, language: lang }));
    setShowLangMenu(false);
  };

  const hasNewCollection = state.collection.some(i => i.collectedAt && i.collectedAt > state.lastVisitCollection);
  const hasNewItems = state.collection.some(i => i.is_coupon && i.collectedAt && i.collectedAt > state.lastVisitItemBox);

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

      <main className="flex-1 w-full max-w-2xl mx-auto px-4 py-4 md:mr-20 pb-24 md:pb-4">
        {/* Mibu Home */}
        {state.view === 'mibu_home' && (
          <div className="space-y-6">
            <div className="text-center py-8">
              <h1 className="text-3xl font-bold text-slate-800 mb-2">Mibu</h1>
              <p className="text-slate-500">{t.appSubtitle || '探索台灣的最佳方式'}</p>
            </div>
            
            <div className="grid gap-4">
              <button
                onClick={() => handleViewChange('gacha_module')}
                className="bg-gradient-to-r from-indigo-500 to-purple-500 text-white p-6 rounded-2xl text-left shadow-lg hover:shadow-xl transition-all"
                data-testid="button-gacha-module"
              >
                <h2 className="text-xl font-bold mb-1">{t.navGachaModule || '行程扭蛋'}</h2>
                <p className="text-white/80 text-sm">{t.appSubtitle || '今天去哪玩?老天說了算'}</p>
              </button>
              
              <button
                onClick={() => handleViewChange('planner_module')}
                className="bg-gradient-to-r from-emerald-500 to-teal-500 text-white p-6 rounded-2xl text-left shadow-lg hover:shadow-xl transition-all"
                data-testid="button-planner-module"
              >
                <h2 className="text-xl font-bold mb-1">{t.navPlannerModule || '旅程策劃'}</h2>
                <p className="text-white/80 text-sm">規劃你的完美旅程</p>
              </button>
            </div>
          </div>
        )}

        {/* Gacha Module */}
        {state.view === 'gacha_module' && (
          <div>
            <ModuleHeader 
              title={t.navGachaModule || '行程扭蛋'} 
              onBack={handleBackToHome} 
              language={state.language} 
            />
            <GachaModuleNav 
              currentTab={gachaSubView} 
              onChange={setGachaSubView} 
              language={state.language} 
            />
            
            {gachaSubView === 'gacha' && (
              <InputForm 
                state={state}
                onUpdate={(updates) => setState(p => ({ ...p, ...updates }))}
                onSubmit={handlePull}
                userName={user?.firstName || user?.email?.split('@')[0]}
              />
            )}
            
            {gachaSubView === 'collection' && (
              <CollectionGrid items={state.collection} language={state.language} />
            )}
            
            {gachaSubView === 'itembox' && (
              <ItemBox items={state.collection.filter(i => i.is_coupon)} language={state.language} />
            )}
          </div>
        )}

        {/* Planner Module */}
        {state.view === 'planner_module' && (
          <div>
            <ModuleHeader 
              title={t.navPlannerModule || '旅程策劃'} 
              onBack={handleBackToHome} 
              language={state.language} 
            />
            <PlannerModuleNav 
              currentTab={plannerSubView} 
              onChange={setPlannerSubView} 
              language={state.language} 
            />
            
            {plannerSubView === 'location' && (
              <div className="text-center py-12 text-slate-500">
                <p>定位功能開發中...</p>
              </div>
            )}
            
            {plannerSubView === 'itinerary' && (
              <TripPlanner
                userId={user?.id}
                isAuthenticated={isAuthenticated}
                onNavigateHome={handleBackToHome}
              />
            )}
            
            {plannerSubView === 'chat' && (
              <div className="text-center py-12 text-slate-500">
                <p>聊天功能開發中...</p>
              </div>
            )}
          </div>
        )}

        {/* Result view - stays in gacha module context */}
        {state.view === 'result' && state.result && (
          <div>
            <ModuleHeader 
              title={t.navGachaModule || '行程扭蛋'} 
              onBack={handleBackToHome} 
              language={state.language} 
            />
            <GachaModuleNav 
              currentTab={gachaSubView} 
              onChange={setGachaSubView} 
              language={state.language} 
            />
            <ResultList data={state.result} language={state.language} onResearch={() => { setGachaSubView('gacha'); setState(prev => ({ ...prev, view: 'gacha_module', result: null })); }} isLoading={state.loading} />
          </div>
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
                 <button onClick={() => { setGachaSubView('gacha'); setState(p => ({ ...p, view: 'gacha_module' })); }} className="w-full mt-3 text-slate-500 text-sm hover:underline" data-testid="button-back-home">{t.backToHome}</button>
              </div>
           </div>
        )}

        {state.view === 'merchant_dashboard' && (
          <MerchantDashboard 
            state={state}
            onLogin={handleMerchantLogin}
            onUpdateMerchant={handleMerchantUpdate}
            onClaim={handleMerchantClaim}
            isAuthenticated={isAuthenticated}
          />
        )}

        {state.view === 'settings' && (
          <div className="space-y-6">
            <h1 className="text-2xl font-bold text-slate-800">{t.navSettings}</h1>
            
            <div className="flex gap-1 p-1 bg-slate-100 rounded-xl">
              {([
                { id: 'mibu' as SettingsTab, label: 'Mibu' },
                { id: 'gacha' as SettingsTab, label: t.navGachaModule || '行程扭蛋' },
                { id: 'planner' as SettingsTab, label: t.navPlannerModule || '旅程策劃' },
              ]).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setSettingsTab(tab.id)}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                    settingsTab === tab.id
                      ? 'bg-white text-indigo-600 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                  data-testid={`tab-settings-${tab.id}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 space-y-4">
              {settingsTab === 'mibu' && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-700 font-medium">{t.language || '語言'}</span>
                    <div className="flex gap-2">
                      {(['zh-TW', 'en', 'ja', 'ko'] as Language[]).map(lang => (
                        <button
                          key={lang}
                          onClick={() => setState(p => ({ ...p, language: lang }))}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                            state.language === lang 
                              ? 'bg-indigo-500 text-white' 
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                          data-testid={`button-lang-${lang}`}
                        >
                          {lang === 'zh-TW' ? '繁中' : lang === 'en' ? 'EN' : lang === 'ja' ? '日本語' : '한국어'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {isAuthenticated && user && (
                    <div className="pt-4 border-t border-slate-100">
                      <div className="flex items-center gap-3 mb-4">
                        {user.profileImageUrl && (
                          <img src={user.profileImageUrl} alt="" className="w-10 h-10 rounded-full" />
                        )}
                        <div>
                          <p className="font-medium text-slate-800">{user.firstName || user.email}</p>
                          <p className="text-sm text-slate-500">{user.email}</p>
                        </div>
                      </div>
                      <a 
                        href="/api/logout" 
                        className="flex items-center gap-2 text-red-500 hover:text-red-600 text-sm font-medium"
                        data-testid="button-logout"
                      >
                        <LogOut className="w-4 h-4" />
                        {t.logout || '登出'}
                      </a>
                    </div>
                  )}

                  {!isAuthenticated && (
                    <div className="pt-4 border-t border-slate-100">
                      <a 
                        href="/api/login" 
                        className="flex items-center gap-2 text-indigo-500 hover:text-indigo-600 font-medium"
                        data-testid="button-login-settings"
                      >
                        <LogIn className="w-4 h-4" />
                        {t.login}
                      </a>
                    </div>
                  )}
                </>
              )}

              {settingsTab === 'gacha' && (
                <div className="space-y-4">
                  <h3 className="font-medium text-slate-800">{t.navGachaModule || '行程扭蛋'} 設定</h3>
                  <div className="pt-4 border-t border-slate-100">
                    <button
                      onClick={() => { setGachaSubView('collection'); setState(p => ({ ...p, view: 'gacha_module' })); }}
                      className="w-full text-left py-2 text-slate-700 hover:text-indigo-600"
                      data-testid="link-collection"
                    >
                      📚 {t.navCollection}
                    </button>
                    <button
                      onClick={() => { setGachaSubView('itembox'); setState(p => ({ ...p, view: 'gacha_module' })); }}
                      className="w-full text-left py-2 text-slate-700 hover:text-indigo-600"
                      data-testid="link-itembox"
                    >
                      📦 {t.navMyBox}
                    </button>
                    <button
                      onClick={() => setState(p => ({ ...p, view: 'merchant_login' }))}
                      className="w-full text-left py-2 text-slate-700 hover:text-indigo-600"
                      data-testid="link-merchant"
                    >
                      🏪 {t.navStore}
                    </button>
                  </div>
                </div>
              )}

              {settingsTab === 'planner' && (
                <div className="space-y-4">
                  <h3 className="font-medium text-slate-800">{t.navPlannerModule || '旅程策劃'} 設定</h3>
                  <p className="text-slate-500 text-sm">旅程策劃偏好設定開發中...</p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      <SideNav 
        currentView={state.view} 
        onChange={handleViewChange}
        language={state.language}
      />
    </div>
  );
};

export default App;
