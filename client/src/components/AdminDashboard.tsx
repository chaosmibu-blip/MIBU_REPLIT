import React, { useState, useEffect, useCallback } from 'react';
import { ModuleHeader } from './ModuleNav';
import { Language } from '../types';

interface PendingUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  isApproved: boolean;
  createdAt: string;
}

interface PendingApplication {
  id: number;
  merchantId: number;
  placeDraftId: number;
  status: string;
  createdAt: string;
  placeDraft?: {
    id: number;
    placeName: string;
    description: string | null;
    source: string;
    status: string;
    categoryId: number | null;
    subcategoryId: number | null;
    districtId: number | null;
    address: string | null;
    googlePlaceId: string | null;
    googleRating: string | null;
  };
  merchant?: {
    id: number;
    name: string;
    email: string;
  };
}

interface Category {
  id: number;
  code: string;
  nameZh: string;
  nameEn: string;
}

interface Subcategory {
  id: number;
  categoryId: number;
  code: string;
  nameZh: string;
  nameEn: string;
}

interface Country {
  id: number;
  code: string;
  nameZh: string;
  nameEn: string;
}

interface Region {
  id: number;
  countryId: number;
  code: string;
  nameZh: string;
  nameEn: string;
}

interface District {
  id: number;
  regionId: number;
  code: string;
  nameZh: string;
  nameEn: string;
}

interface PlaceDraft {
  id: number;
  placeName: string;
  description: string | null;
  source: string;
  status: string;
  categoryId: number;
  subcategoryId: number;
  districtId: number;
  regionId: number;
  countryId: number;
  address: string | null;
  googlePlaceId: string | null;
  googleRating: number | null;
  createdAt: string;
}

interface AdminDashboardProps {
  language: Language;
  onBack: () => void;
  t: Record<string, string>;
}

type TabType = 'pending_users' | 'all_users' | 'pending_apps' | 'create_draft' | 'all_drafts';

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ language, onBack, t }) => {
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [allUsers, setAllUsers] = useState<PendingUser[]>([]);
  const [pendingApplications, setPendingApplications] = useState<PendingApplication[]>([]);
  const [allDrafts, setAllDrafts] = useState<PlaceDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [approving, setApproving] = useState<string | null>(null);
  const [reviewingApp, setReviewingApp] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('pending_users');

  // Form state for create draft
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formSuccess, setFormSuccess] = useState(false);
  const [publishingDraft, setPublishingDraft] = useState<number | null>(null);
  const [expandedDraft, setExpandedDraft] = useState<number | null>(null);
  const [deletingDraft, setDeletingDraft] = useState<number | null>(null);

  const [draftForm, setDraftForm] = useState({
    placeName: '',
    description: '',
    categoryId: '',
    subcategoryId: '',
    countryId: '',
    regionId: '',
    districtId: '',
    address: '',
    googlePlaceId: '',
  });

  const fetchPendingUsers = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/users/pending', {
        credentials: 'include'
      });
      if (!response.ok) {
        throw new Error('無法載入待審核用戶');
      }
      const data = await response.json();
      setPendingUsers(data.users || []);
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  const fetchAllUsers = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/users', {
        credentials: 'include'
      });
      if (!response.ok) {
        throw new Error('無法載入用戶列表');
      }
      const data = await response.json();
      setAllUsers(data.users || []);
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  const fetchPendingApplications = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/applications/pending', {
        credentials: 'include'
      });
      if (!response.ok) {
        throw new Error('無法載入待審核申請');
      }
      const data = await response.json();
      setPendingApplications(data.applications || []);
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  const fetchAllDrafts = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/place-drafts', {
        credentials: 'include'
      });
      if (!response.ok) {
        throw new Error('無法載入草稿列表');
      }
      const data = await response.json();
      setAllDrafts(data.drafts || []);
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  const fetchCategories = useCallback(async () => {
    try {
      const response = await fetch('/api/categories');
      if (response.ok) {
        const data = await response.json();
        setCategories(data.categories || []);
      }
    } catch (err) {
      console.error('Failed to fetch categories', err);
    }
  }, []);

  const fetchCountries = useCallback(async () => {
    try {
      const response = await fetch('/api/locations/countries');
      if (response.ok) {
        const data = await response.json();
        setCountries(data.countries || []);
      }
    } catch (err) {
      console.error('Failed to fetch countries', err);
    }
  }, []);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([
        fetchPendingUsers(), 
        fetchAllUsers(), 
        fetchPendingApplications(),
        fetchAllDrafts(),
        fetchCategories(),
        fetchCountries()
      ]);
      setLoading(false);
    };
    loadData();
  }, [fetchPendingUsers, fetchAllUsers, fetchPendingApplications, fetchAllDrafts, fetchCategories, fetchCountries]);

  // Fetch subcategories when category changes
  useEffect(() => {
    if (draftForm.categoryId) {
      fetch(`/api/categories/${draftForm.categoryId}/subcategories`)
        .then(res => res.json())
        .then(data => setSubcategories(data.subcategories || []))
        .catch(() => setSubcategories([]));
    } else {
      setSubcategories([]);
    }
  }, [draftForm.categoryId]);

  // Fetch regions when country changes
  useEffect(() => {
    if (draftForm.countryId) {
      fetch(`/api/locations/regions/${draftForm.countryId}`)
        .then(res => res.json())
        .then(data => setRegions(data.regions || []))
        .catch(() => setRegions([]));
    } else {
      setRegions([]);
    }
  }, [draftForm.countryId]);

  // Fetch districts when region changes
  useEffect(() => {
    if (draftForm.regionId) {
      fetch(`/api/locations/districts/${draftForm.regionId}`)
        .then(res => res.json())
        .then(data => setDistricts(data.districts || []))
        .catch(() => setDistricts([]));
    } else {
      setDistricts([]);
    }
  }, [draftForm.regionId]);

  const handleApproveUser = async (userId: string) => {
    setApproving(userId);
    setError(null);
    try {
      const response = await fetch(`/api/admin/users/${userId}/approve`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved: true })
      });
      
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || '審核失敗');
      }
      
      await Promise.all([fetchPendingUsers(), fetchAllUsers()]);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setApproving(null);
    }
  };

  const handleReviewApplication = async (applicationId: number, status: 'approved' | 'rejected') => {
    setReviewingApp(applicationId);
    setError(null);
    try {
      const response = await fetch(`/api/admin/applications/${applicationId}/review`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || '審核失敗');
      }
      
      await fetchPendingApplications();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setReviewingApp(null);
    }
  };

  const handleCreateDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormSubmitting(true);
    setError(null);
    setFormSuccess(false);

    try {
      const response = await fetch('/api/admin/place-drafts', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          placeName: draftForm.placeName,
          description: draftForm.description || undefined,
          categoryId: parseInt(draftForm.categoryId),
          subcategoryId: parseInt(draftForm.subcategoryId),
          countryId: parseInt(draftForm.countryId),
          regionId: parseInt(draftForm.regionId),
          districtId: parseInt(draftForm.districtId),
          address: draftForm.address || undefined,
          googlePlaceId: draftForm.googlePlaceId || undefined,
        })
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ? JSON.stringify(data.error) : '建立失敗');
      }

      setFormSuccess(true);
      setDraftForm({
        placeName: '',
        description: '',
        categoryId: '',
        subcategoryId: '',
        countryId: '',
        regionId: '',
        districtId: '',
        address: '',
        googlePlaceId: '',
      });
      await fetchAllDrafts();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setFormSubmitting(false);
    }
  };

  const handlePublishDraft = async (draftId: number) => {
    setPublishingDraft(draftId);
    setError(null);
    try {
      const response = await fetch(`/api/admin/place-drafts/${draftId}/publish`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || '發布失敗');
      }

      await fetchAllDrafts();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setPublishingDraft(null);
    }
  };

  const handleDeleteDraft = async (draftId: number) => {
    if (!confirm('確定要刪除這個草稿嗎？')) return;
    setDeletingDraft(draftId);
    setError(null);
    try {
      const response = await fetch(`/api/admin/place-drafts/${draftId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || '刪除失敗');
      }
      await fetchAllDrafts();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDeletingDraft(null);
    }
  };

  const getRoleLabel = (role: string) => {
    const labels: Record<string, string> = {
      consumer: '消費者',
      merchant: '商家',
      specialist: '策劃師',
      admin: '管理員'
    };
    return labels[role] || role;
  };

  const getRoleColor = (role: string) => {
    const colors: Record<string, string> = {
      consumer: 'bg-blue-100 text-blue-700',
      merchant: 'bg-emerald-100 text-emerald-700',
      specialist: 'bg-purple-100 text-purple-700',
      admin: 'bg-amber-100 text-amber-700'
    };
    return colors[role] || 'bg-slate-100 text-slate-700';
  };

  const getSourceLabel = (source: string) => {
    const labels: Record<string, string> = {
      'ai': 'AI 生成',
      'merchant': '商家建立'
    };
    return labels[source] || source;
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      'pending': '待審核',
      'approved': '已發布',
      'rejected': '已退回'
    };
    return labels[status] || status;
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      'pending': 'bg-amber-100 text-amber-700',
      'approved': 'bg-emerald-100 text-emerald-700',
      'rejected': 'bg-red-100 text-red-700'
    };
    return colors[status] || 'bg-slate-100 text-slate-700';
  };

  return (
    <div className="space-y-6 pb-24">
      <ModuleHeader 
        onBack={onBack} 
        language={language} 
      />
      
      <div className="text-center py-8">
        <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-3xl">⚙️</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-800 mb-2">{t.adminDashboard || '管理後台'}</h1>
        <p className="text-slate-500">{t.adminWelcome || '系統管理中心'}</p>
      </div>
      
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl p-3 shadow-sm border border-slate-100 text-center">
          <div className="text-xl font-bold text-indigo-600 mb-1" data-testid="text-total-users">{allUsers.length}</div>
          <div className="text-xs text-slate-500">{t.totalUsers || '總用戶'}</div>
        </div>
        <div className="bg-white rounded-2xl p-3 shadow-sm border border-slate-100 text-center">
          <div className="text-xl font-bold text-amber-600 mb-1" data-testid="text-pending-users-count">{pendingUsers.length}</div>
          <div className="text-xs text-slate-500">待審核用戶</div>
        </div>
        <div className="bg-white rounded-2xl p-3 shadow-sm border border-slate-100 text-center">
          <div className="text-xl font-bold text-purple-600 mb-1" data-testid="text-pending-apps-count">{pendingApplications.length}</div>
          <div className="text-xs text-slate-500">待審核申請</div>
        </div>
        <div className="bg-white rounded-2xl p-3 shadow-sm border border-slate-100 text-center">
          <div className="text-xl font-bold text-teal-600 mb-1" data-testid="text-drafts-count">{allDrafts.length}</div>
          <div className="text-xs text-slate-500">草稿地點</div>
        </div>
      </div>

      <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
        <button
          onClick={() => setActiveTab('create_draft')}
          className={`py-2 px-3 rounded-xl font-medium transition-colors text-sm whitespace-nowrap ${
            activeTab === 'create_draft' 
              ? 'bg-teal-500 text-white' 
              : 'bg-white text-slate-600 border border-slate-200'
          }`}
          data-testid="tab-create-draft"
        >
          建立草稿
        </button>
        <button
          onClick={() => setActiveTab('all_drafts')}
          className={`py-2 px-3 rounded-xl font-medium transition-colors text-sm whitespace-nowrap ${
            activeTab === 'all_drafts' 
              ? 'bg-cyan-500 text-white' 
              : 'bg-white text-slate-600 border border-slate-200'
          }`}
          data-testid="tab-all-drafts"
        >
          所有草稿 ({allDrafts.length})
        </button>
        <button
          onClick={() => setActiveTab('pending_users')}
          className={`py-2 px-3 rounded-xl font-medium transition-colors text-sm whitespace-nowrap ${
            activeTab === 'pending_users' 
              ? 'bg-amber-500 text-white' 
              : 'bg-white text-slate-600 border border-slate-200'
          }`}
          data-testid="tab-pending-users"
        >
          待審核用戶 ({pendingUsers.length})
        </button>
        <button
          onClick={() => setActiveTab('pending_apps')}
          className={`py-2 px-3 rounded-xl font-medium transition-colors text-sm whitespace-nowrap ${
            activeTab === 'pending_apps' 
              ? 'bg-purple-500 text-white' 
              : 'bg-white text-slate-600 border border-slate-200'
          }`}
          data-testid="tab-pending-apps"
        >
          待審核申請 ({pendingApplications.length})
        </button>
        <button
          onClick={() => setActiveTab('all_users')}
          className={`py-2 px-3 rounded-xl font-medium transition-colors text-sm whitespace-nowrap ${
            activeTab === 'all_users' 
              ? 'bg-indigo-500 text-white' 
              : 'bg-white text-slate-600 border border-slate-200'
          }`}
          data-testid="tab-all-users"
        >
          所有用戶 ({allUsers.length})
        </button>
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100 text-center">
          <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
          <p className="text-slate-500">載入中...</p>
        </div>
      ) : error ? (
        <div className="bg-red-50 rounded-2xl p-6 border border-red-200 text-center">
          <p className="text-red-600">{error}</p>
          <button 
            onClick={() => { setError(null); fetchPendingUsers(); fetchAllUsers(); fetchPendingApplications(); fetchAllDrafts(); }}
            className="mt-2 text-sm text-red-500 underline"
          >
            重試
          </button>
        </div>
      ) : activeTab === 'create_draft' ? (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          <h3 className="font-bold text-slate-800 mb-4">建立草稿行程卡</h3>
          
          {formSuccess && (
            <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-sm">
              草稿建立成功！可前往「所有草稿」分頁發布到行程卡池。
            </div>
          )}

          <form onSubmit={handleCreateDraft} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">地點名稱 *</label>
              <input
                type="text"
                required
                value={draftForm.placeName}
                onChange={(e) => setDraftForm(f => ({ ...f, placeName: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                placeholder="例：阿里山國家森林遊樂區"
                data-testid="input-place-name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">描述</label>
              <textarea
                value={draftForm.description}
                onChange={(e) => setDraftForm(f => ({ ...f, description: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                placeholder="簡短介紹這個地點..."
                rows={3}
                data-testid="input-description"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">分類 *</label>
                <select
                  required
                  value={draftForm.categoryId}
                  onChange={(e) => setDraftForm(f => ({ ...f, categoryId: e.target.value, subcategoryId: '' }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  data-testid="select-category"
                >
                  <option value="">選擇分類</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.nameZh}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">子分類 *</label>
                <select
                  required
                  value={draftForm.subcategoryId}
                  onChange={(e) => setDraftForm(f => ({ ...f, subcategoryId: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  disabled={!draftForm.categoryId}
                  data-testid="select-subcategory"
                >
                  <option value="">選擇子分類</option>
                  {subcategories.map(sub => (
                    <option key={sub.id} value={sub.id}>{sub.nameZh}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">國家 *</label>
              <select
                required
                value={draftForm.countryId}
                onChange={(e) => setDraftForm(f => ({ ...f, countryId: e.target.value, regionId: '', districtId: '' }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                data-testid="select-country"
              >
                <option value="">選擇國家</option>
                {countries.map(c => (
                  <option key={c.id} value={c.id}>{c.nameZh}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">區域/城市 *</label>
                <select
                  required
                  value={draftForm.regionId}
                  onChange={(e) => setDraftForm(f => ({ ...f, regionId: e.target.value, districtId: '' }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  disabled={!draftForm.countryId}
                  data-testid="select-region"
                >
                  <option value="">選擇區域</option>
                  {regions.map(r => (
                    <option key={r.id} value={r.id}>{r.nameZh}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">行政區 *</label>
                <select
                  required
                  value={draftForm.districtId}
                  onChange={(e) => setDraftForm(f => ({ ...f, districtId: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  disabled={!draftForm.regionId}
                  data-testid="select-district"
                >
                  <option value="">選擇行政區</option>
                  {districts.map(d => (
                    <option key={d.id} value={d.id}>{d.nameZh}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">地址</label>
              <input
                type="text"
                value={draftForm.address}
                onChange={(e) => setDraftForm(f => ({ ...f, address: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                placeholder="完整地址（選填）"
                data-testid="input-address"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Google Place ID</label>
              <input
                type="text"
                value={draftForm.googlePlaceId}
                onChange={(e) => setDraftForm(f => ({ ...f, googlePlaceId: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                placeholder="ChIJ...（選填）"
                data-testid="input-google-place-id"
              />
            </div>

            <button
              type="submit"
              disabled={formSubmitting}
              className="w-full py-3 bg-teal-500 text-white rounded-xl font-medium hover:bg-teal-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              data-testid="button-create-draft"
            >
              {formSubmitting ? '建立中...' : '建立草稿'}
            </button>
          </form>
        </div>
      ) : activeTab === 'all_drafts' ? (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          <h3 className="font-bold text-slate-800 mb-4">所有草稿地點</h3>
          {allDrafts.length === 0 ? (
            <p className="text-slate-400 text-center py-4">目前沒有草稿</p>
          ) : (
            <div className="space-y-3">
              {allDrafts.map((draft) => (
                <div 
                  key={draft.id} 
                  className="py-3 px-4 bg-slate-50 rounded-xl cursor-pointer transition-all"
                  data-testid={`draft-${draft.id}`}
                  onClick={() => setExpandedDraft(expandedDraft === draft.id ? null : draft.id)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-slate-800">{draft.placeName}</p>
                        <span className="text-slate-400 text-sm">
                          {expandedDraft === draft.id ? '▲' : '▼'}
                        </span>
                      </div>
                      {draft.description && (
                        <p className={`text-sm text-slate-500 mt-1 ${expandedDraft === draft.id ? '' : 'line-clamp-2'}`}>
                          {draft.description}
                        </p>
                      )}
                      <div className="flex gap-2 mt-2 flex-wrap">
                        <span className={`inline-block text-xs px-2 py-1 rounded-full ${getStatusColor(draft.status)}`}>
                          {getStatusLabel(draft.status)}
                        </span>
                        <span className="inline-block text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700">
                          {getSourceLabel(draft.source)}
                        </span>
                        {draft.googleRating && (
                          <span className="inline-block text-xs px-2 py-1 rounded-full bg-yellow-100 text-yellow-700">
                            ⭐ {draft.googleRating}
                          </span>
                        )}
                      </div>
                      {expandedDraft === draft.id && (
                        <div className="mt-3 pt-3 border-t border-slate-200 space-y-2">
                          {draft.address && (
                            <p className="text-xs text-slate-500">📍 {draft.address}</p>
                          )}
                          {draft.googlePlaceId && (
                            <a
                              href={`https://www.google.com/maps/search/?api=1&query_place_id=${draft.googlePlaceId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1 text-xs px-3 py-1.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                              data-testid={`link-google-maps-${draft.id}`}
                            >
                              🗺️ 在 Google 地圖中查看
                            </a>
                          )}
                          <div className="flex gap-2 mt-2">
                            {draft.status === 'pending' && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handlePublishDraft(draft.id); }}
                                disabled={publishingDraft === draft.id}
                                className="px-3 py-1.5 bg-emerald-500 text-white rounded-lg font-medium hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-xs"
                                data-testid={`button-publish-draft-${draft.id}`}
                              >
                                {publishingDraft === draft.id ? '發布中...' : '發布'}
                              </button>
                            )}
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDeleteDraft(draft.id); }}
                              disabled={deletingDraft === draft.id}
                              className="px-3 py-1.5 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-xs"
                              data-testid={`button-delete-draft-${draft.id}`}
                            >
                              {deletingDraft === draft.id ? '刪除中...' : '刪除'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                    {draft.status === 'pending' && expandedDraft !== draft.id && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handlePublishDraft(draft.id); }}
                        disabled={publishingDraft === draft.id}
                        className="ml-3 px-4 py-2 bg-emerald-500 text-white rounded-lg font-medium hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                        data-testid={`button-publish-draft-collapsed-${draft.id}`}
                      >
                        {publishingDraft === draft.id ? '發布中...' : '發布'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : activeTab === 'pending_users' ? (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          <h3 className="font-bold text-slate-800 mb-4">待審核用戶</h3>
          {pendingUsers.length === 0 ? (
            <p className="text-slate-400 text-center py-4">目前沒有待審核的用戶</p>
          ) : (
            <div className="space-y-3">
              {pendingUsers.map((user) => (
                <div 
                  key={user.id} 
                  className="flex items-center justify-between py-3 px-4 bg-slate-50 rounded-xl"
                  data-testid={`pending-user-${user.id}`}
                >
                  <div className="flex-1">
                    <p className="font-medium text-slate-800">
                      {user.firstName || user.lastName 
                        ? `${user.firstName || ''} ${user.lastName || ''}`.trim()
                        : user.email}
                    </p>
                    <p className="text-sm text-slate-500">{user.email}</p>
                    <span className={`inline-block text-xs px-2 py-1 rounded-full mt-1 ${getRoleColor(user.role)}`}>
                      {getRoleLabel(user.role)}
                    </span>
                  </div>
                  <button
                    onClick={() => handleApproveUser(user.id)}
                    disabled={approving === user.id}
                    className="px-4 py-2 bg-emerald-500 text-white rounded-lg font-medium hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    data-testid={`button-approve-user-${user.id}`}
                  >
                    {approving === user.id ? '審核中...' : '通過'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : activeTab === 'pending_apps' ? (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          <h3 className="font-bold text-slate-800 mb-4">待審核行程卡申請</h3>
          {pendingApplications.length === 0 ? (
            <p className="text-slate-400 text-center py-4">目前沒有待審核的申請</p>
          ) : (
            <div className="space-y-4">
              {pendingApplications.map((app) => (
                <div 
                  key={app.id} 
                  className="py-4 px-4 bg-slate-50 rounded-xl"
                  data-testid={`pending-app-${app.id}`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <p className="font-bold text-slate-800 text-lg">
                        {app.placeDraft?.placeName || '未命名地點'}
                      </p>
                      <div className="flex gap-2 mt-1">
                        <span className="inline-block text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700">
                          {getSourceLabel(app.placeDraft?.source || '')}
                        </span>
                        {app.placeDraft?.googleRating && (
                          <span className="inline-block text-xs px-2 py-1 rounded-full bg-yellow-100 text-yellow-700">
                            ⭐ {app.placeDraft.googleRating}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {app.placeDraft?.description && (
                    <p className="text-sm text-slate-600 mb-3 line-clamp-2">
                      {app.placeDraft.description}
                    </p>
                  )}
                  
                  {app.placeDraft?.address && (
                    <p className="text-xs text-slate-500 mb-3">
                      📍 {app.placeDraft.address}
                    </p>
                  )}

                  {app.merchant && (
                    <p className="text-xs text-slate-500 mb-3">
                      👤 申請商家：{app.merchant.name} ({app.merchant.email})
                    </p>
                  )}
                  
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleReviewApplication(app.id, 'approved')}
                      disabled={reviewingApp === app.id}
                      className="flex-1 px-4 py-2 bg-emerald-500 text-white rounded-lg font-medium hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      data-testid={`button-approve-app-${app.id}`}
                    >
                      {reviewingApp === app.id ? '處理中...' : '通過'}
                    </button>
                    <button
                      onClick={() => handleReviewApplication(app.id, 'rejected')}
                      disabled={reviewingApp === app.id}
                      className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      data-testid={`button-reject-app-${app.id}`}
                    >
                      {reviewingApp === app.id ? '處理中...' : '退回'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          <h3 className="font-bold text-slate-800 mb-4">所有用戶</h3>
          {allUsers.length === 0 ? (
            <p className="text-slate-400 text-center py-4">目前沒有用戶</p>
          ) : (
            <div className="space-y-3">
              {allUsers.map((user) => (
                <div 
                  key={user.id} 
                  className="flex items-center justify-between py-3 px-4 bg-slate-50 rounded-xl"
                  data-testid={`user-${user.id}`}
                >
                  <div className="flex-1">
                    <p className="font-medium text-slate-800">
                      {user.firstName || user.lastName 
                        ? `${user.firstName || ''} ${user.lastName || ''}`.trim()
                        : user.email}
                    </p>
                    <p className="text-sm text-slate-500">{user.email}</p>
                    <div className="flex gap-2 mt-1">
                      <span className={`inline-block text-xs px-2 py-1 rounded-full ${getRoleColor(user.role)}`}>
                        {getRoleLabel(user.role)}
                      </span>
                      <span className={`inline-block text-xs px-2 py-1 rounded-full ${
                        user.isApproved ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {user.isApproved ? '已審核' : '待審核'}
                      </span>
                    </div>
                  </div>
                  {!user.isApproved && (
                    <button
                      onClick={() => handleApproveUser(user.id)}
                      disabled={approving === user.id}
                      className="px-4 py-2 bg-emerald-500 text-white rounded-lg font-medium hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      data-testid={`button-approve-all-${user.id}`}
                    >
                      {approving === user.id ? '審核中...' : '通過'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
