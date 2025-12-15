import React, { useState, useEffect, useCallback } from 'react';
import { Language } from '../../types';

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
  locationLat: number | null;
  locationLng: number | null;
  createdAt: string;
}

type TabType = 'create_draft' | 'all_drafts';

interface PlaceDraftsReviewPageProps {
  language: Language;
  t: Record<string, string>;
}

export const PlaceDraftsReviewPage: React.FC<PlaceDraftsReviewPageProps> = ({ language, t }) => {
  const [allDrafts, setAllDrafts] = useState<PlaceDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('all_drafts');
  const [selectedDraft, setSelectedDraft] = useState<PlaceDraft | null>(null);

  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formSuccess, setFormSuccess] = useState(false);
  const [publishingDraft, setPublishingDraft] = useState<number | null>(null);
  const [deletingDraft, setDeletingDraft] = useState<number | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({ placeName: '', description: '' });
  const [savingEdit, setSavingEdit] = useState(false);
  const [regeneratingDesc, setRegeneratingDesc] = useState(false);

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
        fetchAllDrafts(),
        fetchCategories(),
        fetchCountries()
      ]);
      setLoading(false);
    };
    loadData();
  }, [fetchAllDrafts, fetchCategories, fetchCountries]);

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

      const currentPendingDrafts = allDrafts.filter(d => d.status === 'pending');
      const currentIndex = currentPendingDrafts.findIndex(d => d.id === draftId);
      
      await fetchAllDrafts();
      
      if (selectedDraft?.id === draftId) {
        const remainingPending = currentPendingDrafts.filter(d => d.id !== draftId);
        if (remainingPending.length > 0) {
          const nextIndex = Math.min(currentIndex, remainingPending.length - 1);
          setSelectedDraft(remainingPending[nextIndex]);
        } else {
          setSelectedDraft(null);
        }
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setPublishingDraft(null);
    }
  };

  const handleDeleteDraft = async (draftId: number) => {
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

      const currentPendingDrafts = allDrafts.filter(d => d.status === 'pending');
      const currentIndex = currentPendingDrafts.findIndex(d => d.id === draftId);
      
      await fetchAllDrafts();
      
      if (selectedDraft?.id === draftId) {
        const remainingPending = currentPendingDrafts.filter(d => d.id !== draftId);
        if (remainingPending.length > 0) {
          const nextIndex = Math.min(currentIndex, remainingPending.length - 1);
          setSelectedDraft(remainingPending[nextIndex]);
        } else {
          setSelectedDraft(null);
        }
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDeletingDraft(null);
    }
  };

  const startEditing = () => {
    if (selectedDraft) {
      setEditForm({
        placeName: selectedDraft.placeName,
        description: selectedDraft.description || ''
      });
      setIsEditing(true);
    }
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setEditForm({ placeName: '', description: '' });
  };

  const handleSaveEdit = async () => {
    if (!selectedDraft) return;
    setSavingEdit(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/place-drafts/${selectedDraft.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          placeName: editForm.placeName,
          description: editForm.description
        })
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || '儲存失敗');
      }
      const { draft } = await response.json();
      setSelectedDraft(draft);
      setAllDrafts(prev => prev.map(d => d.id === draft.id ? draft : d));
      setIsEditing(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSavingEdit(false);
    }
  };

  const handleRegenerateDescription = async () => {
    if (!selectedDraft) return;
    setRegeneratingDesc(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/place-drafts/${selectedDraft.id}/regenerate-description`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'AI 重新生成失敗');
      }
      const { draft, description } = await response.json();
      setSelectedDraft(draft);
      setAllDrafts(prev => prev.map(d => d.id === draft.id ? draft : d));
      setEditForm(f => ({ ...f, description }));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setRegeneratingDesc(false);
    }
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

  const getGoogleSearchUrl = (draft: PlaceDraft) => {
    const query = encodeURIComponent(draft.placeName + (draft.address ? ' ' + draft.address : ''));
    return `https://www.google.com/search?igu=1&q=${query}`;
  };

  const getGoogleMapsSearchUrl = (draft: PlaceDraft) => {
    if (draft.googlePlaceId) {
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(draft.placeName)}&query_place_id=${draft.googlePlaceId}`;
    }
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(draft.placeName + (draft.address ? ' ' + draft.address : ''))}`;
  };

  const pendingDrafts = allDrafts.filter(d => d.status === 'pending');

  return (
    <div className="space-y-6">
      <div className="text-center py-6">
        <div className="w-16 h-16 bg-teal-100 rounded-full flex items-center justify-center mx-auto mb-3">
          <span className="text-2xl">📍</span>
        </div>
        <h1 className="text-xl font-bold text-slate-800 mb-1">草稿行程卡審核</h1>
        <p className="text-slate-500 text-sm">建立與審核行程卡草稿</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 text-center">
          <div className="text-2xl font-bold text-teal-600 mb-1" data-testid="text-pending-drafts-count">{pendingDrafts.length}</div>
          <div className="text-sm text-slate-500">待發布草稿</div>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 text-center">
          <div className="text-2xl font-bold text-indigo-600 mb-1" data-testid="text-total-drafts-count">{allDrafts.length}</div>
          <div className="text-sm text-slate-500">草稿總數</div>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 text-center">
          <div className="text-2xl font-bold text-emerald-600 mb-1">{allDrafts.filter(d => d.status === 'approved').length}</div>
          <div className="text-sm text-slate-500">已發布</div>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 text-center">
          <div className="text-2xl font-bold text-red-600 mb-1">{allDrafts.filter(d => d.status === 'rejected').length}</div>
          <div className="text-sm text-slate-500">已退回</div>
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        <button
          onClick={() => { setActiveTab('all_drafts'); setFormSuccess(false); }}
          className={`py-2 px-3 rounded-xl font-medium transition-colors text-sm whitespace-nowrap ${
            activeTab === 'all_drafts' 
              ? 'bg-teal-500 text-white' 
              : 'bg-white text-slate-600 border border-slate-200'
          }`}
          data-testid="tab-all-drafts"
        >
          待發布草稿 ({pendingDrafts.length})
        </button>
        <button
          onClick={() => { setActiveTab('create_draft'); setFormSuccess(false); }}
          className={`py-2 px-3 rounded-xl font-medium transition-colors text-sm whitespace-nowrap ${
            activeTab === 'create_draft' 
              ? 'bg-cyan-500 text-white' 
              : 'bg-white text-slate-600 border border-slate-200'
          }`}
          data-testid="tab-create-draft"
        >
          建立草稿
        </button>
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100 text-center">
          <div className="w-8 h-8 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
          <p className="text-slate-500">載入中...</p>
        </div>
      ) : error ? (
        <div className="bg-red-50 rounded-2xl p-6 border border-red-200 text-center">
          <p className="text-red-600">{error}</p>
          <button 
            onClick={() => { setError(null); fetchAllDrafts(); }}
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
              草稿建立成功！可前往「待發布草稿」分頁發布到行程卡池。
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
      ) : (
        <div className="flex gap-6 min-h-[700px]">
          <div className="w-2/5 bg-white rounded-2xl p-5 shadow-sm border border-slate-100 overflow-y-auto max-h-[700px]">
            <h3 className="font-bold text-slate-800 mb-4 text-lg">待發布草稿</h3>
            {pendingDrafts.length === 0 ? (
              <p className="text-slate-400 text-center py-4">目前沒有待發布的草稿</p>
            ) : (
              <div className="space-y-2">
                {pendingDrafts.map((draft) => (
                  <div 
                    key={draft.id} 
                    className={`py-3 px-3 rounded-xl cursor-pointer transition-all border-2 ${
                      selectedDraft?.id === draft.id 
                        ? 'border-teal-500 bg-teal-50' 
                        : 'border-transparent bg-slate-50 hover:bg-slate-100'
                    }`}
                    data-testid={`draft-${draft.id}`}
                    onClick={() => { setSelectedDraft(draft); setIsEditing(false); }}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-800 truncate">{draft.placeName}</p>
                        {draft.description && (
                          <p className="text-xs text-slate-500 mt-1 line-clamp-1">
                            {draft.description}
                          </p>
                        )}
                        <div className="flex gap-1 mt-2 flex-wrap">
                          <span className={`inline-block text-xs px-2 py-0.5 rounded-full ${getStatusColor(draft.status)}`}>
                            {getStatusLabel(draft.status)}
                          </span>
                          <span className="inline-block text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                            {getSourceLabel(draft.source)}
                          </span>
                          {draft.googleRating && (
                            <span className="inline-block text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">
                              ⭐ {draft.googleRating}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="w-3/5 bg-white rounded-2xl p-5 shadow-sm border border-slate-100 flex flex-col">
            <h3 className="font-bold text-slate-800 mb-4 text-lg">Google 搜尋預覽</h3>
            {selectedDraft ? (
              <div className="flex flex-col flex-1">
                <div className="flex-1 min-h-[450px] rounded-xl overflow-hidden bg-slate-100 mb-4">
                  <iframe
                    src={getGoogleSearchUrl(selectedDraft)}
                    width="100%"
                    height="100%"
                    style={{ border: 0, minHeight: '450px' }}
                    allowFullScreen
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    title={`Google search for ${selectedDraft.placeName}`}
                  />
                </div>
                
                {isEditing ? (
                  <div className="space-y-3 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">地點名稱</label>
                      <input
                        type="text"
                        value={editForm.placeName}
                        onChange={(e) => setEditForm(f => ({ ...f, placeName: e.target.value }))}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                        data-testid="input-edit-place-name"
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-sm font-medium text-slate-700">介紹描述</label>
                        <button
                          onClick={handleRegenerateDescription}
                          disabled={regeneratingDesc}
                          className="text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          data-testid="button-regenerate-description"
                        >
                          {regeneratingDesc ? '生成中...' : '✨ AI 重新生成'}
                        </button>
                      </div>
                      <textarea
                        value={editForm.description}
                        onChange={(e) => setEditForm(f => ({ ...f, description: e.target.value }))}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                        rows={3}
                        data-testid="input-edit-description"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={handleSaveEdit}
                        disabled={savingEdit}
                        className="flex-1 py-2 bg-teal-500 text-white rounded-lg font-medium hover:bg-teal-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                        data-testid="button-save-edit"
                      >
                        {savingEdit ? '儲存中...' : '儲存'}
                      </button>
                      <button
                        onClick={cancelEditing}
                        className="py-2 px-4 bg-slate-200 text-slate-700 rounded-lg font-medium hover:bg-slate-300 transition-colors text-sm"
                        data-testid="button-cancel-edit"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2 mb-4">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-slate-800">{selectedDraft.placeName}</h4>
                      <button
                        onClick={startEditing}
                        className="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors"
                        data-testid="button-start-edit"
                      >
                        ✏️ 編輯
                      </button>
                    </div>
                    {selectedDraft.description && (
                      <p className="text-sm text-slate-600">{selectedDraft.description}</p>
                    )}
                    {selectedDraft.address && (
                      <p className="text-xs text-slate-500">📍 {selectedDraft.address}</p>
                    )}
                    {selectedDraft.googlePlaceId && (
                      <p className="text-xs text-slate-400">Place ID: {selectedDraft.googlePlaceId}</p>
                    )}
                    {(selectedDraft.locationLat && selectedDraft.locationLng) && (
                      <p className="text-xs text-slate-400">座標: {selectedDraft.locationLat}, {selectedDraft.locationLng}</p>
                    )}
                  </div>
                )}

                <div className="flex gap-2">
                  <a
                    href={getGoogleMapsSearchUrl(selectedDraft)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 py-2 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-colors text-sm text-center"
                    data-testid={`link-google-maps-${selectedDraft.id}`}
                  >
                    🗺️ 開啟 Google 地圖
                  </a>
                  <button
                    onClick={() => handlePublishDraft(selectedDraft.id)}
                    disabled={publishingDraft === selectedDraft.id || isEditing}
                    className="flex-1 py-2 bg-emerald-500 text-white rounded-lg font-medium hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                    data-testid={`button-publish-draft-${selectedDraft.id}`}
                  >
                    {publishingDraft === selectedDraft.id ? '發布中...' : '✓ 發布'}
                  </button>
                  <button
                    onClick={() => handleDeleteDraft(selectedDraft.id)}
                    disabled={deletingDraft === selectedDraft.id || isEditing}
                    className="py-2 px-4 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                    data-testid={`button-delete-draft-${selectedDraft.id}`}
                  >
                    {deletingDraft === selectedDraft.id ? '...' : '✗'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-slate-400">
                <div className="text-center">
                  <span className="text-4xl block mb-2">👈</span>
                  <p>點擊左側草稿查看地圖預覽</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
