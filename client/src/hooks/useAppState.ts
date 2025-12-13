import { useState, useEffect } from 'react';
import { useAuth } from './useAuth';
import { AppState, Language, GachaItem, GachaSubView, PlannerSubView, SettingsTab, Merchant, AppView } from '../types';
import { DEFAULT_LEVEL, TRANSLATIONS } from '../constants';

export const STORAGE_KEYS = {
  COLLECTION: 'travel_gacha_collection',
  LAST_COLLECTION_VISIT: 'mibu_last_visit_collection',
  LAST_BOX_VISIT: 'mibu_last_visit_itembox',
  MERCHANT_DB: 'mibu_merchant_db',
  MERCHANT_PROFILE: 'mibu_merchant_profile_v3', 
  DAILY_LIMIT: 'mibu_daily_limit',
  GUEST_ID: 'mibu_guest_id',
  SELECTED_ROLE: 'mibu_selected_role'
};

export const getViewForRole = (role: string): 'mibu_home' | 'merchant_dashboard' | 'agent_dashboard' | 'admin_dashboard' => {
  switch (role) {
    case 'merchant': return 'merchant_dashboard';
    case 'agent': return 'agent_dashboard';
    case 'admin': return 'admin_dashboard';
    default: return 'mibu_home';
  }
};

export const generateGuestId = () => `guest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

export const getItemKey = (item: GachaItem): string => {
  try {
    if (!item) return `unknown-${Math.random()}`;
    let nameStr = typeof item.place_name === 'string' ? item.place_name : (item.place_name as any)['en'] || (item.place_name as any)['zh-TW'] || 'unknown';
    return `${nameStr}-${item.city || 'city'}`;
  } catch (e) { return `error-${Math.random()}`; }
};

export const getPlaceId = (item: GachaItem): string => {
  const raw = item.place_name as any;
  if (typeof raw === 'string') return raw;
  return raw['en'] || raw['zh-TW'] || 'unknown';
};

export function useAppState() {
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  
  const [state, setState] = useState<AppState>(() => {
    const existingGuestId = localStorage.getItem(STORAGE_KEYS.GUEST_ID);
    const initialView = (isAuthenticated || existingGuestId) ? 'mibu_home' : 'login';
    return {
      language: 'zh-TW', user: null, country: '', city: '', countryId: null, regionId: null, level: DEFAULT_LEVEL,
      loading: false, result: null, error: null, groundingSources: [], view: initialView as any,
      collection: [], celebrationCoupons: [], 
      lastVisitCollection: new Date().toISOString(), lastVisitItemBox: new Date().toISOString(),
      merchantDb: {}, currentMerchant: null
    };
  });

  const [showLangMenu, setShowLangMenu] = useState(false);
  const [showRoleMenu, setShowRoleMenu] = useState(false);
  const [selectedRole, setSelectedRole] = useState<'consumer' | 'merchant' | 'agent' | 'admin'>('consumer');
  const [gachaSubView, setGachaSubViewRaw] = useState<GachaSubView>('gacha');
  const [plannerSubView, setPlannerSubView] = useState<PlannerSubView>('itinerary');
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('mibu');

  const t = TRANSLATIONS[state.language] as any;

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

  const handleViewChange = (newView: AppView) => {
    if (newView === 'gacha_module') { 
      setGachaSubViewRaw('gacha'); 
      setState(prev => ({ ...prev, view: newView })); 
    } else if (newView === 'planner_module') { 
      setPlannerSubView('itinerary'); 
      setState(prev => ({ ...prev, view: newView })); 
    } else { 
      setState(prev => ({ ...prev, view: newView })); 
    }
  };

  const handleBackToHome = () => {
    setState(prev => ({ ...prev, view: 'mibu_home', result: null }));
  };

  const handleLanguageChange = (lang: Language) => {
    setState(prev => ({ ...prev, language: lang }));
    setShowLangMenu(false);
  };

  // Sync Replit Auth user to state
  useEffect(() => {
    if (user) {
      const savedRole = localStorage.getItem(STORAGE_KEYS.SELECTED_ROLE) || 'consumer';
      const targetView = getViewForRole(savedRole);
      setState(prev => ({
        ...prev,
        view: prev.view === 'login' ? targetView : prev.view,
        user: {
          id: user.id,
          name: user.firstName || user.email || 'User',
          email: user.email,
          avatar: user.profileImageUrl,
        }
      }));
    }
  }, [user]);

  // Handle logout
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      const guestId = localStorage.getItem(STORAGE_KEYS.GUEST_ID);
      if (!guestId && state.view !== 'login') {
        setState(prev => ({ ...prev, view: 'login', user: null }));
      }
    }
  }, [authLoading, isAuthenticated, state.view]);

  // Check for existing guest session
  useEffect(() => {
    const guestId = localStorage.getItem(STORAGE_KEYS.GUEST_ID);
    if (guestId && !isAuthenticated && state.view === 'login') {
      setState(prev => ({
        ...prev,
        view: 'mibu_home',
        user: {
          id: guestId,
          name: t.guest || '訪客',
          email: null,
          avatar: null,
          provider: 'guest'
        }
      }));
    }
  }, [isAuthenticated]);

  // Load user collections
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
          const savedCollection = localStorage.getItem(STORAGE_KEYS.COLLECTION);
          if (savedCollection) {
            try {
              const parsed = JSON.parse(savedCollection);
              if (Array.isArray(parsed)) {
                const validItems = parsed.filter((i: any) => i && typeof i === 'object' && i.place_name);
                setState(prev => ({ ...prev, collection: validItems }));
              }
            } catch (e) {}
          }
        }
      }
    };
    loadCollections();
  }, [isAuthenticated, user?.id]);

  // Load persisted data
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

      if (!isAuthenticated) {
        const savedCollection = localStorage.getItem(STORAGE_KEYS.COLLECTION);
        if (savedCollection) {
          const parsed = JSON.parse(savedCollection);
          if (Array.isArray(parsed)) {
            const validItems = parsed.filter((i: any) => i && typeof i === 'object' && i.place_name);
            setState(prev => ({ ...prev, collection: validItems }));
          }
        }
      }
    } catch (e) { 
      console.error("Persistence Error", e); 
    }
  }, [isAuthenticated]);

  // Check payment status
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
          }
        } catch (e) {
          console.error('Failed to verify payment', e);
        }
      }
    };
    checkPaymentStatus();
  }, [state.language]);

  const isInGachaModule = ['gacha_module', 'result', 'merchant_login', 'merchant_dashboard'].includes(state.view);
  const isInPlannerModule = state.view === 'planner_module';
  const hasNewCollection = state.collection.some(i => i.collectedAt && i.collectedAt > state.lastVisitCollection);
  const hasNewItems = state.collection.some(i => i.is_coupon && i.collectedAt && i.collectedAt > state.lastVisitItemBox);

  return {
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
    settingsTab,
    setSettingsTab,
    handleViewChange,
    handleBackToHome,
    handleLanguageChange,
    isInGachaModule,
    isInPlannerModule,
    hasNewCollection,
    hasNewItems,
  };
}
