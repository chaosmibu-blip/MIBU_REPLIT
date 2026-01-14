import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Language } from '../../types';
import { formatTWDate } from '../../lib/utils';

interface Place {
  id: number;
  place_name: string;
  country: string;
  city: string;
  district: string;
  address: string;
  category: string;
  subcategory: string;
  description?: string;
  rating: number;
  is_active: boolean;
  claim_status: string;
  place_card_tier: string;
  merchant_id: number | null;
  created_at: string;
}

interface PlacesResponse {
  places: Place[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  filters?: {
    cities: string[];
    categories: string[];
  };
}

interface PlacesManagementPageProps {
  language: Language;
  t: Record<string, string>;
}

// 編輯 Modal 組件
const EditPlaceModal: React.FC<{
  place: Place;
  onClose: () => void;
  onSave: () => void;
}> = ({ place, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    placeName: place.place_name,
    category: place.category,
    subcategory: place.subcategory || '',
    description: place.description || '',
    placeCardTier: place.place_card_tier || 'free',
    isActive: place.is_active,
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/places/${place.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(formData),
      });
      if (!res.ok) throw new Error('更新失敗');
      onSave();
      onClose();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-slate-800">編輯景點</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">景點名稱</label>
            <input
              type="text"
              value={formData.placeName}
              onChange={(e) => setFormData({ ...formData, placeName: e.target.value })}
              className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">分類</label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg"
              >
                <option value="美食">美食</option>
                <option value="住宿">住宿</option>
                <option value="景點">景點</option>
                <option value="購物">購物</option>
                <option value="娛樂設施">娛樂設施</option>
                <option value="生態文化教育">生態文化教育</option>
                <option value="遊程體驗">遊程體驗</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">子分類</label>
              <input
                type="text"
                value={formData.subcategory}
                onChange={(e) => setFormData({ ...formData, subcategory: e.target.value })}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">描述</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              className="w-full px-4 py-2 border border-slate-200 rounded-lg resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">行程卡等級</label>
            <select
              value={formData.placeCardTier}
              onChange={(e) => setFormData({ ...formData, placeCardTier: e.target.value })}
              className="w-full px-4 py-2 border border-slate-200 rounded-lg"
            >
              <option value="free">免費</option>
              <option value="pro">專業</option>
              <option value="premium">高級</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isActive"
              checked={formData.isActive}
              onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
              className="w-4 h-4 text-indigo-600 rounded"
            />
            <label htmlFor="isActive" className="text-sm text-slate-700">啟用此景點</label>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-slate-200 rounded-lg hover:bg-slate-50"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? '儲存中...' : '儲存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export const PlacesManagementPage: React.FC<PlacesManagementPageProps> = ({ language }) => {
  const [data, setData] = useState<PlacesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [editingPlace, setEditingPlace] = useState<Place | null>(null);
  const [filters, setFilters] = useState<{ cities: string[]; categories: string[] } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [deleting, setDeleting] = useState(false);

  // Debounce 搜尋
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search]);

  // AbortController for fetch cancellation
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchPlaces = useCallback(async () => {
    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        page: page.toString(),
        limit: '30',
        ...(debouncedSearch && { search: debouncedSearch }),
        ...(categoryFilter && { category: categoryFilter }),
        ...(cityFilter && { city: cityFilter }),
        ...(statusFilter && { status: statusFilter }),
        // 如果已有篩選器，跳過重新查詢以提升效能
        ...(filters && { skipFilters: 'true' }),
      });

      const res = await fetch(`/api/admin/places?${params}`, {
        credentials: 'include',
        signal: abortControllerRef.current.signal,
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || '無法載入景點');
      }

      const result = await res.json();
      setData(result);
      // 只在首次載入時更新篩選器
      if (result.filters && !filters) {
        setFilters(result.filters);
      }
    } catch (err: any) {
      // 忽略被取消的請求，不更新任何狀態
      if (err.name === 'AbortError') {
        return;
      }
      // 只有在非取消錯誤時才設置錯誤狀態
      console.error('[PlacesManagement] Fetch error:', err.message);
      setError(err.message);
      setLoading(false);
      return;
    }
    setLoading(false);
  }, [page, debouncedSearch, categoryFilter, cityFilter, statusFilter, filters]);

  useEffect(() => {
    fetchPlaces();
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchPlaces]);

  const handleToggleStatus = async (placeId: number) => {
    try {
      const res = await fetch(`/api/admin/places/${placeId}/toggle-status`, {
        method: 'PATCH',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('切換狀態失敗');
      fetchPlaces();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDelete = async (placeId: number, hardDelete = false) => {
    const confirmMsg = hardDelete
      ? '確定要永久刪除此景點嗎？此操作無法復原！'
      : '確定要停用此景點嗎？';
    if (!confirm(confirmMsg)) return;

    try {
      const res = await fetch(`/api/admin/places/${placeId}${hardDelete ? '?hard=true' : ''}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('刪除失敗');
      fetchPlaces();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleBatchDelete = async (hardDelete = false) => {
    if (selectedIds.size === 0) return;

    const confirmMsg = hardDelete
      ? `確定要永久刪除 ${selectedIds.size} 個景點嗎？此操作無法復原！`
      : `確定要停用 ${selectedIds.size} 個景點嗎？`;
    if (!confirm(confirmMsg)) return;

    setDeleting(true);
    try {
      const res = await fetch('/api/admin/places/batch-delete', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds), hardDelete }),
      });
      if (!res.ok) throw new Error('批次刪除失敗');
      const result = await res.json();
      alert(result.message);
      setSelectedIds(new Set());
      fetchPlaces();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setDeleting(false);
    }
  };

  const toggleSelectAll = () => {
    if (!data) return;
    if (selectedIds.size === data.places.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(data.places.map(p => p.id)));
    }
  };

  const toggleSelect = (id: number) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const getCategoryLabel = (category: string) => {
    const labels: Record<string, string> = {
      dining: '美食',
      accommodation: '住宿',
      attraction: '景點',
      shopping: '購物',
      entertainment: '娛樂設施',
      education: '生態文化教育',
      experience: '遊程體驗',
      '美食': '美食',
      '住宿': '住宿',
      '景點': '景點',
      '購物': '購物',
      '娛樂設施': '娛樂設施',
      '生態文化教育': '生態文化教育',
      '遊程體驗': '遊程體驗',
    };
    return labels[category] || category;
  };

  const getClaimStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      unclaimed: '未認領',
      pending: '待審核',
      claimed: '已認領',
    };
    return labels[status] || status;
  };

  if (loading && !data) {
    return (
      <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100 text-center">
        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
        <p className="text-slate-500">載入景點資料中...</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl">
        <p className="font-medium">載入失敗</p>
        <p className="text-sm">{error}</p>
        <button
          onClick={fetchPlaces}
          className="mt-3 px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200"
        >
          重試
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 編輯 Modal */}
      {editingPlace && (
        <EditPlaceModal
          place={editingPlace}
          onClose={() => setEditingPlace(null)}
          onSave={fetchPlaces}
        />
      )}

      {/* 標題 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">景點管理</h2>
          <p className="text-slate-500">管理所有景點資料與狀態</p>
        </div>
        <button
          onClick={fetchPlaces}
          disabled={loading}
          className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl font-medium hover:bg-slate-200 transition-colors disabled:opacity-50"
        >
          {loading ? '載入中...' : '重新整理'}
        </button>
      </div>

      {/* 搜尋與篩選 */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜尋景點名稱或地址...（自動搜尋）"
            className="flex-1 min-w-[200px] px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
          <select
            value={categoryFilter}
            onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
            className="px-4 py-2 border border-slate-200 rounded-lg"
          >
            <option value="">所有分類</option>
            {filters?.categories.map(cat => (
              <option key={cat} value={cat}>{getCategoryLabel(cat)}</option>
            ))}
          </select>
          <select
            value={cityFilter}
            onChange={(e) => { setCityFilter(e.target.value); setPage(1); }}
            className="px-4 py-2 border border-slate-200 rounded-lg"
          >
            <option value="">所有城市</option>
            {filters?.cities.map(city => (
              <option key={city} value={city}>{city}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="px-4 py-2 border border-slate-200 rounded-lg"
          >
            <option value="">全部狀態</option>
            <option value="active">啟用中</option>
            <option value="inactive">已停用</option>
          </select>
        </div>
      </div>

      {/* 錯誤提示（非阻塞） */}
      {error && data && (
        <div className="bg-amber-50 border border-amber-200 text-amber-700 px-4 py-2 rounded-lg text-sm">
          更新時發生錯誤：{error}
        </div>
      )}

      {/* 統計與批次操作 */}
      {data && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-slate-500">
            共 {data.pagination.total} 個景點 {loading && <span className="text-indigo-500">（載入中...）</span>}
          </div>
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-600">已選擇 {selectedIds.size} 項</span>
              <button
                onClick={() => handleBatchDelete(false)}
                disabled={deleting}
                className="px-3 py-1.5 text-sm bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50"
              >
                批次停用
              </button>
              <button
                onClick={() => handleBatchDelete(true)}
                disabled={deleting}
                className="px-3 py-1.5 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50"
              >
                批次刪除
              </button>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="px-3 py-1.5 text-sm bg-slate-200 text-slate-600 rounded-lg hover:bg-slate-300"
              >
                取消選擇
              </button>
            </div>
          )}
        </div>
      )}

      {/* 景點列表 */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="w-12 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={data ? selectedIds.size === data.places.length && data.places.length > 0 : false}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                </th>
                <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">景點名稱</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">地點</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">分類</th>
                <th className="text-center px-4 py-3 text-sm font-medium text-slate-600">評分</th>
                <th className="text-center px-4 py-3 text-sm font-medium text-slate-600">認領狀態</th>
                <th className="text-center px-4 py-3 text-sm font-medium text-slate-600">狀態</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">建立時間</th>
                <th className="text-center px-4 py-3 text-sm font-medium text-slate-600">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data?.places.map((place) => (
                <tr key={place.id} className={`hover:bg-slate-50 ${selectedIds.has(place.id) ? 'bg-indigo-50' : ''}`}>
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(place.id)}
                      onChange={() => toggleSelect(place.id)}
                      className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800">{place.place_name}</div>
                    <div className="text-xs text-slate-400">ID: {place.id}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {place.city} {place.district}
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-1 text-xs bg-slate-100 text-slate-600 rounded">
                      {getCategoryLabel(place.category)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-sm">
                    {place.rating ? `${Number(place.rating).toFixed(1)}` : '-'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-1 text-xs rounded ${
                      place.claim_status === 'claimed' ? 'bg-green-100 text-green-700' :
                      place.claim_status === 'pending' ? 'bg-amber-100 text-amber-700' :
                      'bg-slate-100 text-slate-600'
                    }`}>
                      {getClaimStatusLabel(place.claim_status)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-1 text-xs rounded ${
                      place.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {place.is_active ? '啟用' : '停用'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-500">
                    {formatTWDate(place.created_at)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => setEditingPlace(place)}
                        className="px-2 py-1 text-xs bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100"
                        title="編輯"
                      >
                        編輯
                      </button>
                      <button
                        onClick={() => handleToggleStatus(place.id)}
                        className={`px-2 py-1 text-xs rounded transition-colors ${
                          place.is_active
                            ? 'bg-amber-50 text-amber-600 hover:bg-amber-100'
                            : 'bg-green-50 text-green-600 hover:bg-green-100'
                        }`}
                        title={place.is_active ? '停用' : '啟用'}
                      >
                        {place.is_active ? '停用' : '啟用'}
                      </button>
                      <button
                        onClick={() => handleDelete(place.id, true)}
                        className="px-2 py-1 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100"
                        title="永久刪除"
                      >
                        刪除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 空狀態 */}
        {data?.places.length === 0 && (
          <div className="py-12 text-center text-slate-500">
            沒有符合條件的景點
          </div>
        )}

        {/* 分頁 */}
        {data && data.pagination.totalPages > 1 && (
          <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between">
            <div className="text-sm text-slate-500">
              第 {data.pagination.page} / {data.pagination.totalPages} 頁
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1 || loading}
                className="px-3 py-1 border border-slate-200 rounded text-sm disabled:opacity-50"
              >
                上一頁
              </button>
              <button
                onClick={() => setPage(p => Math.min(data.pagination.totalPages, p + 1))}
                disabled={page >= data.pagination.totalPages || loading}
                className="px-3 py-1 border border-slate-200 rounded text-sm disabled:opacity-50"
              >
                下一頁
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
