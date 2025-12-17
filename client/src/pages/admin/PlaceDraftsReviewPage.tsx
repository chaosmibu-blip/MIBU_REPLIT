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
  googleReviewCount: number | null;
  locationLat: number | null;
  locationLng: number | null;
  createdAt: string;
}

interface BatchPublishResult {
  success: boolean;
  published: number;
  failed: number;
  publishedIds: number[];
  errors: { id: number; message: string }[];
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
  const [subcategoriesAll, setSubcategoriesAll] = useState<Subcategory[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formSuccess, setFormSuccess] = useState(false);
  const [publishingDraft, setPublishingDraft] = useState<number | null>(null);
  const [deletingDraft, setDeletingDraft] = useState<number | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({ placeName: '', description: '', categoryId: '', subcategoryId: '' });
  const [savingEdit, setSavingEdit] = useState(false);
  const [regeneratingDesc, setRegeneratingDesc] = useState(false);
  const [showBatchPanel, setShowBatchPanel] = useState(false);
  const [batchFilter, setBatchFilter] = useState({ minRating: '', minReviewCount: '' });
  const [batchPublishing, setBatchPublishing] = useState(false);
  const [batchResult, setBatchResult] = useState<BatchPublishResult | null>(null);
  const [filteredCount, setFilteredCount] = useState<number | null>(null);
  const [loadingFilteredCount, setLoadingFilteredCount] = useState(false);
  const [batchRegenerating, setBatchRegenerating] = useState(false);
  const [regenerateResult, setRegenerateResult] = useState<{ regenerated: number; failed: number; errors?: { id: number; placeName: string; error: string }[] } | null>(null);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillResult, setBackfillResult] = useState<{ updated: number; failed: number; remaining: number } | null>(null);
  const [cacheReviewing, setCacheReviewing] = useState(false);
  const [cacheReviewResult, setCacheReviewResult] = useState<{ passed: number; movedToDraft: number; remaining: number } | null>(null);
  const [cacheStats, setCacheStats] = useState<{ total: number; reviewed: number; unreviewed: number } | null>(null);

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
    if (editForm.categoryId) {
      fetch(`/api/categories/${editForm.categoryId}/subcategories`)
        .then(res => res.json())
        .then(data => setSubcategoriesAll(data.subcategories || []))
        .catch(() => { /* preserve existing subcategoriesAll on error */ });
    } else {
      setSubcategoriesAll([]);
    }
  }, [editForm.categoryId]);

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
        description: selectedDraft.description || '',
        categoryId: selectedDraft.categoryId ? selectedDraft.categoryId.toString() : '',
        subcategoryId: selectedDraft.subcategoryId ? selectedDraft.subcategoryId.toString() : ''
      });
      setIsEditing(true);
    }
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setEditForm({ placeName: '', description: '', categoryId: '', subcategoryId: '' });
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
          description: editForm.description,
          categoryId: editForm.categoryId ? parseInt(editForm.categoryId) : undefined,
          subcategoryId: editForm.subcategoryId ? parseInt(editForm.subcategoryId) : undefined
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

  const handlePreviewBatchFilter = async () => {
    setLoadingFilteredCount(true);
    setBatchResult(null);
    try {
      const params = new URLSearchParams();
      if (batchFilter.minRating) params.append('minRating', batchFilter.minRating);
      if (batchFilter.minReviewCount) params.append('minReviewCount', batchFilter.minReviewCount);
      params.append('status', 'pending');
      
      const response = await fetch(`/api/admin/place-drafts/filter?${params.toString()}`, {
        credentials: 'include'
      });
      if (!response.ok) {
        throw new Error('無法查詢符合條件的草稿');
      }
      const data = await response.json();
      setFilteredCount(data.count || 0);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingFilteredCount(false);
    }
  };

  const handleBatchPublish = async () => {
    if (filteredCount === 0) return;
    
    const confirmMsg = `確定要批次發布 ${filteredCount} 筆草稿嗎？`;
    if (!window.confirm(confirmMsg)) return;
    
    setBatchPublishing(true);
    setBatchResult(null);
    setError(null);
    try {
      const filter: { minRating?: number; minReviewCount?: number } = {};
      if (batchFilter.minRating) filter.minRating = parseFloat(batchFilter.minRating);
      if (batchFilter.minReviewCount) filter.minReviewCount = parseInt(batchFilter.minReviewCount);
      
      const response = await fetch('/api/admin/place-drafts/batch-publish', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(filter)
      });
      
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || '批次發布失敗');
      }
      
      const result = await response.json();
      setBatchResult(result);
      setFilteredCount(null);
      await fetchAllDrafts();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBatchPublishing(false);
    }
  };

  const handleBatchRegenerate = async () => {
    if (filteredCount === 0) return;
    
    const confirmMsg = `確定要為 ${filteredCount} 筆草稿重新生成 AI 描述嗎？這可能需要幾分鐘時間。`;
    if (!window.confirm(confirmMsg)) return;
    
    setBatchRegenerating(true);
    setRegenerateResult(null);
    setBatchResult(null);
    setError(null);
    try {
      const filter: { minRating?: number; minReviewCount?: number } = {};
      if (batchFilter.minRating) filter.minRating = parseFloat(batchFilter.minRating);
      if (batchFilter.minReviewCount) filter.minReviewCount = parseInt(batchFilter.minReviewCount);
      
      const response = await fetch('/api/admin/place-drafts/batch-regenerate', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(filter)
      });
      
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || '批次重新生成失敗');
      }
      
      const result = await response.json();
      setRegenerateResult(result);
      await fetchAllDrafts();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBatchRegenerating(false);
    }
  };

  const handleBackfillReviewCount = async () => {
    const confirmMsg = '確定要回填現有草稿的 Google 評論數嗎？這會從 Google API 取得評論數資料（每次最多 50 筆）。';
    if (!window.confirm(confirmMsg)) return;
    
    setBackfilling(true);
    setBackfillResult(null);
    setError(null);
    try {
      const response = await fetch('/api/admin/place-drafts/backfill-review-count', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 50 })
      });
      
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || '回填評論數失敗');
      }
      
      const result = await response.json();
      setBackfillResult(result);
      await fetchAllDrafts();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBackfilling(false);
    }
  };

  const fetchCacheStats = async () => {
    try {
      const response = await fetch('/api/admin/place-cache/review-stats', {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setCacheStats(data);
      }
    } catch (err) {
      console.error('Failed to fetch cache stats', err);
    }
  };

  const handleCacheReview = async () => {
    const confirmMsg = '確定要用 AI 審核現有快取資料嗎？不合格的資料會被刪除（每次最多 50 筆）。';
    if (!window.confirm(confirmMsg)) return;
    
    setCacheReviewing(true);
    setCacheReviewResult(null);
    setError(null);
    try {
      const response = await fetch('/api/admin/place-cache/batch-review', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 50 })
      });
      
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || '快取審核失敗');
      }
      
      const result = await response.json();
      setCacheReviewResult(result);
      if (result.stats) {
        setCacheStats(result.stats);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCacheReviewing(false);
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
      'auto_generated': 'AI 待審',
      'pending': '人工待審',
      'approved': '已發布',
      'rejected': '已退回'
    };
    return labels[status] || status;
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      'auto_generated': 'bg-blue-100 text-blue-700',
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

  const autoGeneratedDrafts = allDrafts.filter(d => d.status === 'auto_generated');
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
          <div className="text-2xl font-bold text-blue-600 mb-1" data-testid="text-ai-review-count">{autoGeneratedDrafts.length}</div>
          <div className="text-sm text-slate-500">AI 待審</div>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 text-center">
          <div className="text-2xl font-bold text-amber-600 mb-1" data-testid="text-pending-drafts-count">{pendingDrafts.length}</div>
          <div className="text-sm text-slate-500">人工待審</div>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 text-center">
          <div className="text-2xl font-bold text-indigo-600 mb-1" data-testid="text-total-drafts-count">{allDrafts.length}</div>
          <div className="text-sm text-slate-500">草稿總數</div>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 text-center">
          <div className="text-2xl font-bold text-emerald-600 mb-1">{allDrafts.filter(d => d.status === 'approved').length}</div>
          <div className="text-sm text-slate-500">已發布</div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <button
          onClick={() => { setShowBatchPanel(!showBatchPanel); setBatchResult(null); setRegenerateResult(null); setBackfillResult(null); setCacheReviewResult(null); setFilteredCount(null); }}
          className="w-full px-5 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
          data-testid="button-toggle-batch-panel"
        >
          <div className="flex items-center gap-3">
            <span className="text-xl">⚡</span>
            <span className="font-medium text-slate-800">批次發布工具</span>
          </div>
          <svg 
            className={`w-5 h-5 text-slate-400 transition-transform ${showBatchPanel ? 'rotate-180' : ''}`} 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        
        {showBatchPanel && (
          <div className="px-5 py-4 border-t border-slate-100 space-y-4">
            <p className="text-sm text-slate-600">
              根據 Google 評分和評論數篩選，一次發布多筆草稿到行程卡池。
            </p>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">最低評分 (0-5)</label>
                <input
                  type="number"
                  min="0"
                  max="5"
                  step="0.1"
                  value={batchFilter.minRating}
                  onChange={(e) => { setBatchFilter(f => ({ ...f, minRating: e.target.value })); setFilteredCount(null); }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder="例：4.0"
                  data-testid="input-batch-min-rating"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">最少評論數</label>
                <input
                  type="number"
                  min="0"
                  value={batchFilter.minReviewCount}
                  onChange={(e) => { setBatchFilter(f => ({ ...f, minReviewCount: e.target.value })); setFilteredCount(null); }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder="例：100"
                  data-testid="input-batch-min-review-count"
                />
              </div>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={handlePreviewBatchFilter}
                disabled={loadingFilteredCount}
                className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg font-medium hover:bg-slate-200 disabled:opacity-50 transition-colors text-sm"
                data-testid="button-preview-batch-filter"
              >
                {loadingFilteredCount ? '查詢中...' : '預覽符合條件數量'}
              </button>
              
              {filteredCount !== null && (
                <>
                  <button
                    onClick={handleBatchRegenerate}
                    disabled={batchRegenerating || batchPublishing || filteredCount === 0}
                    className="px-4 py-2 bg-purple-500 text-white rounded-lg font-medium hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                    data-testid="button-batch-regenerate"
                  >
                    {batchRegenerating ? 'AI 重新生成中...' : `AI 重新生成 ${filteredCount} 筆`}
                  </button>
                  <button
                    onClick={handleBatchPublish}
                    disabled={batchPublishing || batchRegenerating || filteredCount === 0}
                    className="px-4 py-2 bg-emerald-500 text-white rounded-lg font-medium hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                    data-testid="button-batch-publish"
                  >
                    {batchPublishing ? '發布中...' : `批次發布 ${filteredCount} 筆`}
                  </button>
                </>
              )}
            </div>
            
            {filteredCount !== null && !batchResult && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-700 text-sm">
                找到 <strong>{filteredCount}</strong> 筆符合條件的待發布草稿
                {filteredCount === 0 && '，請調整篩選條件'}
              </div>
            )}
            
            {batchResult && (
              <div className={`p-4 rounded-xl border ${batchResult.failed > 0 ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">{batchResult.failed > 0 ? '⚠️' : '✅'}</span>
                  <span className="font-medium text-slate-800">批次發布完成</span>
                </div>
                <div className="text-sm space-y-1">
                  <p className="text-emerald-700">成功發布：{batchResult.published} 筆</p>
                  {batchResult.failed > 0 && (
                    <>
                      <p className="text-red-600">發布失敗：{batchResult.failed} 筆</p>
                      <div className="mt-2 text-xs text-red-500">
                        {batchResult.errors.slice(0, 5).map((err, i) => (
                          <p key={i}>ID {err.id}: {err.message}</p>
                        ))}
                        {batchResult.errors.length > 5 && (
                          <p>...還有 {batchResult.errors.length - 5} 筆錯誤</p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
            
            {regenerateResult && (
              <div className={`p-4 rounded-xl border ${regenerateResult.failed > 0 ? 'bg-amber-50 border-amber-200' : 'bg-purple-50 border-purple-200'}`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">{regenerateResult.failed > 0 ? '⚠️' : '✨'}</span>
                  <span className="font-medium text-slate-800">AI 重新生成完成</span>
                </div>
                <div className="text-sm space-y-1">
                  <p className="text-purple-700">成功重新生成：{regenerateResult.regenerated} 筆</p>
                  {regenerateResult.failed > 0 && (
                    <>
                      <p className="text-red-600">生成失敗：{regenerateResult.failed} 筆</p>
                      {regenerateResult.errors && (
                        <div className="mt-2 text-xs text-red-500">
                          {regenerateResult.errors.slice(0, 5).map((err, i) => (
                            <p key={i}>{err.placeName}: {err.error}</p>
                          ))}
                          {regenerateResult.errors.length > 5 && (
                            <p>...還有 {regenerateResult.errors.length - 5} 筆錯誤</p>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
            
            {/* 回填評論數區塊 */}
            <div className="pt-4 border-t border-slate-200">
              <h4 className="text-sm font-medium text-slate-700 mb-2">回填 Google 評論數</h4>
              <p className="text-xs text-slate-500 mb-3">
                現有草稿可能沒有 Google 評論數資料。點擊下方按鈕從 Google API 取得評論數（每次最多 50 筆）。
              </p>
              <button
                onClick={handleBackfillReviewCount}
                disabled={backfilling || batchPublishing || batchRegenerating}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                data-testid="button-backfill-review-count"
              >
                {backfilling ? '回填中...' : '回填評論數（每次 50 筆）'}
              </button>
              
              {backfillResult && (
                <div className={`mt-3 p-3 rounded-xl border ${backfillResult.failed > 0 ? 'bg-amber-50 border-amber-200' : 'bg-blue-50 border-blue-200'}`}>
                  <div className="text-sm space-y-1">
                    <p className="text-blue-700">成功回填：{backfillResult.updated} 筆</p>
                    {backfillResult.failed > 0 && (
                      <p className="text-red-600">失敗：{backfillResult.failed} 筆</p>
                    )}
                    <p className="text-slate-600">剩餘待回填：{backfillResult.remaining} 筆</p>
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-slate-100 pt-4">
              <h4 className="font-medium text-slate-700 mb-2 flex items-center gap-2">
                <span className="text-lg">🔍</span>
                AI 審核快取資料
              </h4>
              <p className="text-sm text-slate-500 mb-3">
                用 AI 審核現有的快取資料（place_cache），不合格的會被刪除。
              </p>
              
              {cacheStats && (
                <div className="mb-3 p-3 bg-slate-50 rounded-xl text-sm">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <div className="text-lg font-bold text-slate-700">{cacheStats.total}</div>
                      <div className="text-xs text-slate-500">總計</div>
                    </div>
                    <div>
                      <div className="text-lg font-bold text-emerald-600">{cacheStats.reviewed}</div>
                      <div className="text-xs text-slate-500">已審核</div>
                    </div>
                    <div>
                      <div className="text-lg font-bold text-amber-600">{cacheStats.unreviewed}</div>
                      <div className="text-xs text-slate-500">待審核</div>
                    </div>
                  </div>
                </div>
              )}
              
              <div className="flex gap-2">
                <button
                  onClick={fetchCacheStats}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg font-medium hover:bg-slate-200 transition-colors text-sm"
                  data-testid="button-fetch-cache-stats"
                >
                  刷新統計
                </button>
                <button
                  onClick={handleCacheReview}
                  disabled={cacheReviewing || batchPublishing || batchRegenerating || backfilling}
                  className="px-4 py-2 bg-purple-500 text-white rounded-lg font-medium hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                  data-testid="button-cache-review"
                >
                  {cacheReviewing ? 'AI 審核中...' : '開始 AI 審核（每次 50 筆）'}
                </button>
              </div>
              
              {cacheReviewResult && (
                <div className={`mt-3 p-3 rounded-xl border ${cacheReviewResult.movedToDraft > 0 ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}>
                  <div className="text-sm space-y-1">
                    <p className="text-emerald-700">通過審核：{cacheReviewResult.passed} 筆</p>
                    <p className="text-amber-600">移至草稿：{cacheReviewResult.movedToDraft} 筆</p>
                    <p className="text-slate-600">剩餘待審核：{cacheReviewResult.remaining} 筆</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
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
                        {draft.description?.startsWith('[AI審核不通過]') && (
                          <p className="text-xs text-red-600 mt-1 font-medium">
                            {draft.description.split('\n')[0]}
                          </p>
                        )}
                        {draft.description && !draft.description.startsWith('[AI審核不通過]') && (
                          <p className="text-xs text-slate-500 mt-1 line-clamp-1">
                            {draft.description}
                          </p>
                        )}
                        <div className="flex gap-1 mt-2 flex-wrap">
                          {draft.description?.startsWith('[AI審核不通過]') && (
                            <span className="inline-block text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                              🚫 AI退回
                            </span>
                          )}
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
                          {draft.googleReviewCount && (
                            <span className="inline-block text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                              💬 {draft.googleReviewCount}
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
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">分類</label>
                        <select
                          value={editForm.categoryId}
                          onChange={(e) => setEditForm(f => ({ ...f, categoryId: e.target.value, subcategoryId: '' }))}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                          data-testid="select-edit-category"
                        >
                          <option value="">選擇分類</option>
                          {categories.map(cat => (
                            <option key={cat.id} value={cat.id}>{cat.nameZh}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">子分類</label>
                        <select
                          value={editForm.subcategoryId}
                          onChange={(e) => setEditForm(f => ({ ...f, subcategoryId: e.target.value }))}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                          disabled={!editForm.categoryId}
                          data-testid="select-edit-subcategory"
                        >
                          <option value="">選擇子分類</option>
                          {subcategoriesAll.map(sub => (
                            <option key={sub.id} value={sub.id}>{sub.nameZh}</option>
                          ))}
                        </select>
                      </div>
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
