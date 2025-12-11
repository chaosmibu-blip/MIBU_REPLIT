import React, { useState, useEffect } from 'react';
import { Merchant, AppState } from '../types';
import { SUBSCRIPTION_PLANS, TRANSLATIONS } from '../constants';
import { Store, CheckCircle, Plus, ShieldCheck, Crown, Sparkles, Search, MapPin, Tag, X, Edit3, Check, Loader2 } from 'lucide-react';

interface PlaceCache {
  id: number;
  placeName: string;
  district: string;
  city: string;
  country: string;
  category: string;
  subCategory: string;
  description: string;
  googleRating?: string;
  verifiedAddress?: string;
}

interface MerchantPlaceLink {
  id: number;
  merchantId: number;
  placeCacheId?: number;
  placeName: string;
  district: string;
  city: string;
  country: string;
  status: 'pending' | 'approved' | 'rejected';
  promoTitle?: string;
  promoDescription?: string;
  promoImageUrl?: string;
  isPromoActive: boolean;
  createdAt: string;
}

interface MerchantDashboardProps {
  state: AppState;
  onLogin: (name: string, email: string) => void;
  onUpdateMerchant: (merchant: Merchant) => void;
  onClaim: (item: any) => void;
  isAuthenticated?: boolean;
}

export const MerchantDashboard: React.FC<MerchantDashboardProps> = ({ state, onLogin, onUpdateMerchant, isAuthenticated }) => {
  const [name, setName] = useState('');
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [activeTab, setActiveTab] = useState<'places' | 'coupons'>('places');
  
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PlaceCache[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [claimedPlaces, setClaimedPlaces] = useState<MerchantPlaceLink[]>([]);
  const [isLoadingPlaces, setIsLoadingPlaces] = useState(false);
  const [claimingPlaceId, setClaimingPlaceId] = useState<number | null>(null);
  
  const [editingPromo, setEditingPromo] = useState<number | null>(null);
  const [promoForm, setPromoForm] = useState({ title: '', description: '' });
  const [savingPromo, setSavingPromo] = useState(false);

  const t = TRANSLATIONS[state.language] as any;

  useEffect(() => {
    if (isAuthenticated) {
      loadClaimedPlaces();
    }
  }, [isAuthenticated]);

  const loadClaimedPlaces = async () => {
    setIsLoadingPlaces(true);
    try {
      const response = await fetch('/api/merchant/places', { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        setClaimedPlaces(data.places || []);
      }
    } catch (error) {
      console.error('Failed to load claimed places:', error);
    } finally {
      setIsLoadingPlaces(false);
    }
  };

  const handleSearch = async () => {
    if (searchQuery.length < 2) return;
    
    setIsSearching(true);
    try {
      const response = await fetch(`/api/merchant/places/search?query=${encodeURIComponent(searchQuery)}`, {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setSearchResults(data.places || []);
      }
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleClaim = async (place: PlaceCache) => {
    setClaimingPlaceId(place.id);
    try {
      const response = await fetch('/api/merchant/places/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          placeName: place.placeName,
          district: place.district,
          city: place.city,
          country: place.country,
          placeCacheId: place.id
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        setClaimedPlaces(prev => [data.link, ...prev]);
        setSearchResults(prev => prev.filter(p => p.id !== place.id));
      } else {
        const error = await response.json();
        alert(error.error || '認領失敗');
      }
    } catch (error) {
      console.error('Claim error:', error);
      alert('認領失敗，請稍後再試');
    } finally {
      setClaimingPlaceId(null);
    }
  };

  const handleEditPromo = (link: MerchantPlaceLink) => {
    setEditingPromo(link.id);
    setPromoForm({
      title: link.promoTitle || '',
      description: link.promoDescription || ''
    });
  };

  const handleSavePromo = async (linkId: number) => {
    setSavingPromo(true);
    try {
      const response = await fetch(`/api/merchant/places/${linkId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          promoTitle: promoForm.title,
          promoDescription: promoForm.description,
          isPromoActive: promoForm.title.length > 0
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        setClaimedPlaces(prev => prev.map(p => p.id === linkId ? data.link : p));
        setEditingPromo(null);
      }
    } catch (error) {
      console.error('Save promo error:', error);
    } finally {
      setSavingPromo(false);
    }
  };

  const handleUpgradeToPremium = async () => {
    if (!isAuthenticated) {
      setShowLoginPrompt(true);
      return;
    }
    
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

  if (showLoginPrompt) {
    return (
      <div className="p-8 max-w-md mx-auto mt-20 bg-white rounded-3xl shadow-xl">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <Crown className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-black text-slate-800">需要登入</h2>
          <p className="text-slate-500 text-sm mt-2">升級 Premium 需要先登入您的帳戶</p>
        </div>
        
        <a 
          href="/api/login"
          className="w-full py-4 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:from-amber-600 hover:to-orange-600 transition-colors shadow-lg"
          data-testid="button-login-to-upgrade"
        >
          <Store className="w-5 h-5" />
          登入以繼續升級
        </a>
        
        <button 
          onClick={() => setShowLoginPrompt(false)}
          className="w-full mt-3 py-3 text-slate-500 text-sm hover:bg-slate-50 rounded-xl"
        >
          返回
        </button>
      </div>
    );
  }
  
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
          <a 
            href="/api/login"
            className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-indigo-700 transition-colors"
            data-testid="button-merchant-auth"
          >
            <Store className="w-5 h-5" />
            {t.signInReplit}
          </a>
          
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
            data-testid="input-merchant-store-name"
          />
          <button
            onClick={() => onLogin(name, 'test@example.com')}
            className="w-full py-4 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800"
            data-testid="button-merchant-guest"
          >
            {t.enterDashboard}
          </button>
        </div>
      </div>
    );
  }

  const merchant = state.currentMerchant;
  const plan = merchant ? SUBSCRIPTION_PLANS[merchant.subscriptionPlan] : SUBSCRIPTION_PLANS.free;
  const isPremium = merchant?.subscriptionPlan === 'premium';

  return (
    <div className="pb-32 max-w-lg mx-auto pt-4 px-4">
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
          
          <div className="grid grid-cols-2 gap-3 mt-4">
            <div className="bg-white/10 rounded-xl p-3">
               <div className="text-2xl font-black">{claimedPlaces.length}</div>
               <div className="text-[10px] opacity-60 uppercase">已認領地點</div>
            </div>
            <div className="bg-white/10 rounded-xl p-3">
               <div className="text-2xl font-black">{claimedPlaces.filter(p => p.isPromoActive).length}</div>
               <div className="text-[10px] opacity-60 uppercase">進行中優惠</div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setActiveTab('places')}
          className={`flex-1 py-3 rounded-xl font-bold transition-colors ${activeTab === 'places' ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-600'}`}
          data-testid="tab-places"
        >
          <MapPin className="w-4 h-4 inline mr-2" />
          地點管理
        </button>
        <button
          onClick={() => setActiveTab('coupons')}
          className={`flex-1 py-3 rounded-xl font-bold transition-colors ${activeTab === 'coupons' ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-600'}`}
          data-testid="tab-coupons"
        >
          <Tag className="w-4 h-4 inline mr-2" />
          優惠券
        </button>
      </div>

      {activeTab === 'places' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
            <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
              <Search className="w-4 h-4 text-indigo-500" />
              搜尋並認領地點
            </h3>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="輸入店家名稱..."
                className="flex-1 px-4 py-3 bg-slate-50 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                data-testid="input-search-place"
              />
              <button
                onClick={handleSearch}
                disabled={isSearching || searchQuery.length < 2}
                className="px-4 py-3 bg-indigo-500 text-white rounded-xl font-bold hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                data-testid="button-search-place"
              >
                {isSearching ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
              </button>
            </div>
            
            {searchResults.length > 0 && (
              <div className="mt-4 space-y-2 max-h-64 overflow-y-auto">
                {searchResults.map(place => (
                  <div key={place.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-slate-800 truncate">{place.placeName}</div>
                      <div className="text-xs text-slate-500">{place.city} {place.district}</div>
                    </div>
                    <button
                      onClick={() => handleClaim(place)}
                      disabled={claimingPlaceId === place.id}
                      className="ml-2 px-3 py-2 bg-emerald-500 text-white rounded-lg text-sm font-bold hover:bg-emerald-600 disabled:opacity-50 flex items-center gap-1"
                      data-testid={`button-claim-${place.id}`}
                    >
                      {claimingPlaceId === place.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <Plus className="w-4 h-4" />
                          認領
                        </>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
            <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
              <Store className="w-4 h-4 text-indigo-500" />
              我的地點 ({claimedPlaces.length})
            </h3>
            
            {isLoadingPlaces ? (
              <div className="py-8 text-center">
                <Loader2 className="w-8 h-8 animate-spin mx-auto text-slate-400" />
              </div>
            ) : claimedPlaces.length === 0 ? (
              <div className="py-8 text-center text-slate-400">
                <MapPin className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p className="text-sm">尚未認領任何地點</p>
                <p className="text-xs">搜尋並認領您的店家</p>
              </div>
            ) : (
              <div className="space-y-3">
                {claimedPlaces.map(link => (
                  <div key={link.id} className="p-4 bg-slate-50 rounded-xl">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="font-bold text-slate-800">{link.placeName}</div>
                        <div className="text-xs text-slate-500">{link.city} {link.district}</div>
                      </div>
                      <div className={`px-2 py-1 rounded text-xs font-bold ${
                        link.status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                        link.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {link.status === 'approved' ? '已核准' : link.status === 'pending' ? '審核中' : '已拒絕'}
                      </div>
                    </div>
                    
                    {link.status === 'approved' && (
                      <>
                        {editingPromo === link.id ? (
                          <div className="mt-3 space-y-2">
                            <input
                              type="text"
                              placeholder="優惠標題 (如: 打卡送飲料)"
                              className="w-full px-3 py-2 bg-white rounded-lg border border-slate-200 text-sm"
                              value={promoForm.title}
                              onChange={e => setPromoForm(p => ({ ...p, title: e.target.value }))}
                              data-testid="input-promo-title"
                            />
                            <textarea
                              placeholder="優惠說明..."
                              className="w-full px-3 py-2 bg-white rounded-lg border border-slate-200 text-sm resize-none"
                              rows={2}
                              value={promoForm.description}
                              onChange={e => setPromoForm(p => ({ ...p, description: e.target.value }))}
                              data-testid="input-promo-description"
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleSavePromo(link.id)}
                                disabled={savingPromo}
                                className="flex-1 py-2 bg-emerald-500 text-white rounded-lg text-sm font-bold hover:bg-emerald-600 disabled:opacity-50 flex items-center justify-center gap-1"
                                data-testid="button-save-promo"
                              >
                                {savingPromo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                儲存
                              </button>
                              <button
                                onClick={() => setEditingPromo(null)}
                                className="px-4 py-2 bg-slate-200 text-slate-600 rounded-lg text-sm font-bold"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="mt-3">
                            {link.promoTitle ? (
                              <div className="p-3 bg-gradient-to-r from-amber-50 to-orange-50 rounded-lg border border-amber-200">
                                <div className="flex items-center justify-between">
                                  <div>
                                    <div className="font-bold text-amber-800 text-sm">{link.promoTitle}</div>
                                    {link.promoDescription && (
                                      <div className="text-xs text-amber-600 mt-1">{link.promoDescription}</div>
                                    )}
                                  </div>
                                  <button
                                    onClick={() => handleEditPromo(link)}
                                    className="p-2 text-amber-600 hover:bg-amber-100 rounded-lg"
                                    data-testid={`button-edit-promo-${link.id}`}
                                  >
                                    <Edit3 className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button
                                onClick={() => handleEditPromo(link)}
                                className="w-full py-2 border-2 border-dashed border-slate-300 rounded-lg text-slate-400 text-sm font-bold hover:border-indigo-300 hover:text-indigo-500 transition-colors flex items-center justify-center gap-1"
                                data-testid={`button-add-promo-${link.id}`}
                              >
                                <Plus className="w-4 h-4" />
                                新增優惠活動
                              </button>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'coupons' && (
        <div className="space-y-4">
          <button 
            className="w-full py-4 border-2 border-dashed border-slate-300 rounded-2xl text-slate-400 font-bold flex items-center justify-center gap-2 hover:bg-slate-50 hover:border-indigo-300 hover:text-indigo-500 transition-colors"
            data-testid="button-create-campaign"
          >
            <Plus className="w-5 h-5" />
            {t.createCampaign}
          </button>

          {merchant?.subscriptionPlan === 'free' && (
             <div className="bg-gradient-to-r from-amber-100 to-orange-100 p-6 rounded-3xl mt-8 border border-amber-200">
               <div className="flex items-center gap-2 mb-3">
                 <Sparkles className="w-6 h-6 text-amber-600" />
                 <h3 className="font-black text-amber-900 text-xl">{t.upgradeTitle}</h3>
               </div>
               <ul className="space-y-2 mb-5">
                 <li className="flex items-center gap-2 text-amber-800 text-sm font-bold">
                   <CheckCircle className="w-4 h-4 text-amber-600" /> 認領多個地點
                 </li>
                 <li className="flex items-center gap-2 text-amber-800 text-sm font-bold">
                   <CheckCircle className="w-4 h-4 text-amber-600" /> 優惠券無限發行
                 </li>
                 <li className="flex items-center gap-2 text-amber-800 text-sm font-bold">
                   <CheckCircle className="w-4 h-4 text-amber-600" /> 詳細數據分析
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
                     處理中...
                   </>
                 ) : (
                   <>
                     <Crown className="w-5 h-5" />
                     升級 Premium - NT$1,499/月
                   </>
                 )}
               </button>
             </div>
          )}

          {isPremium && (
            <div className="bg-gradient-to-r from-amber-50 to-orange-50 p-4 rounded-2xl border border-amber-200 flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full flex items-center justify-center">
                <Crown className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="font-bold text-amber-900">Premium 會員</div>
                <div className="text-xs text-amber-700">享有所有進階功能</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
