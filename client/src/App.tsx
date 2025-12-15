import React from 'react';
import { MapProvider } from '../../modules/trip-planner/client/context/MapContext';
import { GachaItem, GachaResponse, Merchant } from './types';
import { InputForm } from './components/InputForm';
import { GachaScene } from './components/GachaScene';
import { ResultList } from './components/ResultList';
import { CollectionGrid } from './components/CollectionGrid';
import { ItemBox } from './components/ItemBox';
import { ModuleHeader, GachaModuleNav, PlannerModuleNav, HomeNav } from './components/ModuleNav';
import { CouponCelebration } from './components/CouponCelebration';
import { MerchantDashboard } from './components/MerchantDashboard';
import { AdminDashboard } from './components/AdminDashboard';
import { TripPlanner } from '../../modules/trip-planner/client';
import { LocationView } from '../../modules/trip-planner/client/components/LocationView';
import { ChatView } from '../../modules/trip-planner/client/components/ChatView';
import { ServicePlans } from '../../modules/trip-planner/client/components/ServicePlans';
import { OfflineIndicator } from './components/OfflineIndicator';
import { TRANSLATIONS, MAX_DAILY_GENERATIONS } from './constants';
import { useAppState, STORAGE_KEYS, getItemKey, getPlaceId } from './hooks/useAppState';
import { AppHeader } from './components/AppHeader';
import { LoginPage } from './pages/LoginPage';

const App: React.FC = () => {
  const {
    state,
    setState,
    user,
    authLoading,
    isAuthenticated,
    t,
    showLangMenu,
    setShowLangMenu,
    showRoleMenu,
    setShowRoleMenu,
    selectedRole,
    setSelectedRole,
    gachaSubView,
    setGachaSubView,
    setGachaSubViewRaw,
    plannerSubView,
    setPlannerSubView,
    handleViewChange,
    handleBackToHome,
    handleLanguageChange,
    isInGachaModule,
    isInPlannerModule,
    hasNewCollection,
    hasNewItems,
  } = useAppState();

  const handleMerchantLoginStart = () => setState(prev => ({ ...prev, view: 'merchant_login' }));

  const handleMerchantLogin = async (name: string, email: string) => {
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
      
      const response = await fetch('/api/gacha/itinerary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          countryId: state.countryId, 
          regionId: state.regionId,
          language: state.language,
          itemCount: state.level
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to generate itinerary');
      }
      
      const result = await response.json();
      const { itinerary } = result;
      
      if (itinerary.meta?.shortageWarning) {
        setTimeout(() => {
          alert(itinerary.meta.shortageWarning);
        }, 500);
      }
      
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
        city: itinerary.location.region.nameZh || itinerary.location.region.name,
        cityDisplay: itinerary.location.region.name,
        district: itinerary.location.district.nameZh || itinerary.location.district.name,
        districtDisplay: itinerary.location.district.name,
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
          city: itinerary.location.region.nameZh || itinerary.location.region.name,
          locked_district: itinerary.location.district.nameZh || itinerary.location.district.name,
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
                  googleTypes: Array.isArray(item.google_types) ? item.google_types.join(',') : null,
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
    <MapProvider language={state.language}>
    <div className="min-h-screen flex flex-col font-sans relative bg-slate-50 text-slate-900 transition-colors duration-500 pb-20 select-none">
      <div className="fixed top-0 left-0 w-full h-96 bg-gradient-to-b from-indigo-50 to-transparent pointer-events-none -z-10"></div>
      
      {state.celebrationCoupons.length > 0 && <CouponCelebration items={state.celebrationCoupons} language={state.language} onClose={() => setState(p => ({ ...p, celebrationCoupons: [] }))} />}
      
      <OfflineIndicator />

      <AppHeader
        isAuthenticated={isAuthenticated}
        user={user}
        showLangMenu={showLangMenu}
        setShowLangMenu={setShowLangMenu}
        handleLanguageChange={handleLanguageChange}
        onLogout={() => {
          localStorage.removeItem(STORAGE_KEYS.GUEST_ID);
          window.location.href = '/api/logout';
        }}
        onLoginClick={() => setState(prev => ({ ...prev, view: 'login', user: null }))}
        currentView={state.view}
        t={t}
      />

      {state.loading && <GachaScene language={state.language} />}

      <main className="flex-1 w-full max-w-2xl mx-auto px-4 py-4">
        {state.view === 'login' && (
          <LoginPage
            selectedRole={selectedRole}
            setSelectedRole={setSelectedRole}
            showRoleMenu={showRoleMenu}
            setShowRoleMenu={setShowRoleMenu}
            setState={setState}
            t={t}
          />
        )}

        {state.view === 'mibu_home' && (
          <div className="space-y-6 pb-24">
            <div className="text-center py-4">
              <h1 className="text-3xl font-bold text-slate-800 mb-2">Mibu</h1>
              <p className="text-slate-500">{t.appSubtitle || '探索台灣的最佳方式'}</p>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4" data-testid="section-announcements">
              <h3 className="text-sm font-bold text-amber-800 mb-2 flex items-center gap-2">
                📢 {t.announcements || '公告'}
              </h3>
              <div className="space-y-2 text-sm text-amber-700">
                <p>• 歡迎使用 Mibu 旅遊扭蛋！探索台灣各地的精彩景點</p>
                <p>• 新功能：旅程策劃模組已上線，規劃你的完美行程</p>
              </div>
            </div>

            <div className="bg-gradient-to-r from-rose-500 to-pink-500 text-white rounded-2xl p-4 shadow-lg" data-testid="section-flash-events">
              <h3 className="text-sm font-bold mb-2 flex items-center gap-2">
                ⚡ {t.flashEvents || '快閃活動'}
              </h3>
              <div className="space-y-2 text-sm text-white/90">
                <p>🎁 冬季限定：宜蘭礁溪溫泉季 - 收集溫泉景點獲得特別優惠！</p>
                <p>🌟 本週熱門：台北信義區聖誕市集巡禮</p>
              </div>
            </div>
            
            <HomeNav 
              currentView={state.view}
              onChange={handleViewChange}
              language={state.language}
            />
          </div>
        )}

        {state.view === 'gacha_module' && (
          <div className="pb-24">
            <ModuleHeader 
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

        {state.view === 'planner_module' && (
          <div className="pb-24">
            <ModuleHeader 
              onBack={handleBackToHome} 
              language={state.language} 
            />
            <PlannerModuleNav 
              currentTab={plannerSubView} 
              onChange={setPlannerSubView} 
              language={state.language} 
            />
            
            {plannerSubView === 'location' && (
              <div className="h-[calc(100vh-180px)]">
                <LocationView language={state.language} />
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
              <ChatView 
                language={state.language} 
                userId={user?.id} 
                isAuthenticated={isAuthenticated} 
              />
            )}
            
            {plannerSubView === 'service' && (
              <ServicePlans 
                isAuthenticated={isAuthenticated}
                onLoginRequired={() => window.location.href = '/api/login'}
                onSelectPlan={(plan, method) => {
                  console.log('Selected plan:', plan, 'Payment method:', method);
                }}
              />
            )}
          </div>
        )}

        {state.view === 'result' && state.result && (
          <div className="pb-24">
            <ModuleHeader 
              onBack={handleBackToHome} 
              language={state.language} 
            />
            <GachaModuleNav 
              currentTab={gachaSubView} 
              onChange={(tab) => {
                setGachaSubView(tab);
                setState(prev => ({ ...prev, view: 'gacha_module', result: null }));
              }} 
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

        {state.view === 'agent_dashboard' && (
          <div className="space-y-6 pb-24">
            <ModuleHeader 
              onBack={() => setState(prev => ({ ...prev, view: 'login' }))} 
              language={state.language} 
            />
            
            <div className="text-center py-8">
              <div className="w-20 h-20 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">👤</span>
              </div>
              <h1 className="text-2xl font-bold text-slate-800 mb-2">{t.agentDashboard || '專員後台'}</h1>
              <p className="text-slate-500">{t.agentWelcome || '歡迎回來，專員'}</p>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 text-center">
                <div className="text-3xl font-bold text-purple-600 mb-1">128</div>
                <div className="text-sm text-slate-500">{t.pendingTasks || '待處理任務'}</div>
              </div>
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 text-center">
                <div className="text-3xl font-bold text-emerald-600 mb-1">45</div>
                <div className="text-sm text-slate-500">{t.completedToday || '今日完成'}</div>
              </div>
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 text-center">
                <div className="text-3xl font-bold text-amber-600 mb-1">12</div>
                <div className="text-sm text-slate-500">{t.merchantReviews || '商家審核'}</div>
              </div>
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 text-center">
                <div className="text-3xl font-bold text-indigo-600 mb-1">89%</div>
                <div className="text-sm text-slate-500">{t.satisfactionRate || '滿意度'}</div>
              </div>
            </div>
            
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
              <h3 className="font-bold text-slate-800 mb-4">{t.recentTasks || '近期任務'}</h3>
              <div className="space-y-3">
                {[
                  { title: '審核商家申請 - 阿里山茶園', status: 'pending', time: '10 分鐘前' },
                  { title: '處理用戶反饋 - 行程建議', status: 'processing', time: '30 分鐘前' },
                  { title: '更新景點資料 - 日月潭', status: 'completed', time: '1 小時前' },
                ].map((task, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                    <div>
                      <p className="text-sm font-medium text-slate-700">{task.title}</p>
                      <p className="text-xs text-slate-400">{task.time}</p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      task.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                      task.status === 'processing' ? 'bg-blue-100 text-blue-700' :
                      'bg-emerald-100 text-emerald-700'
                    }`}>
                      {task.status === 'pending' ? '待處理' : task.status === 'processing' ? '處理中' : '已完成'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {state.view === 'admin_dashboard' && (
          <AdminDashboard
            language={state.language}
            onBack={() => setState(prev => ({ ...prev, view: 'login' }))}
            t={t}
          />
        )}
      </main>
    </div>
    </MapProvider>
  );
};

export default App;
