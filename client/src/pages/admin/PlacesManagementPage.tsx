import React, { useState, useEffect, useCallback } from 'react';
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
  rating: number;
  is_active: boolean;
  claim_status: string;
  place_card_tier: string;
  merchant_id: number | null;
  created_at: string;
  updated_at: string;
}

interface PlacesResponse {
  places: Place[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  filters: {
    cities: string[];
    categories: string[];
  };
}

interface PlacesManagementPageProps {
  language: Language;
  t: Record<string, string>;
}

export const PlacesManagementPage: React.FC<PlacesManagementPageProps> = ({ language }) => {
  const [data, setData] = useState<PlacesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const fetchPlaces = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '30',
        ...(search && { search }),
        ...(categoryFilter && { category: categoryFilter }),
        ...(cityFilter && { city: cityFilter }),
        ...(statusFilter && { status: statusFilter }),
      });

      const res = await fetch(`/api/admin/places?${params}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('無法載入景點');
      const result = await res.json();
      setData(result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, search, categoryFilter, cityFilter, statusFilter]);

  useEffect(() => {
    fetchPlaces();
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

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchPlaces();
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

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 標題 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">景點管理</h2>
          <p className="text-slate-500">管理所有景點資料與狀態</p>
        </div>
        <button
          onClick={fetchPlaces}
          className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl font-medium hover:bg-slate-200 transition-colors"
        >
          重新整理
        </button>
      </div>

      {/* 搜尋與篩選 */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
        <form onSubmit={handleSearch} className="flex flex-wrap gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜尋景點名稱或地址..."
            className="flex-1 min-w-[200px] px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
          <select
            value={categoryFilter}
            onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
            className="px-4 py-2 border border-slate-200 rounded-lg"
          >
            <option value="">所有分類</option>
            {data?.filters.categories.map(cat => (
              <option key={cat} value={cat}>{getCategoryLabel(cat)}</option>
            ))}
          </select>
          <select
            value={cityFilter}
            onChange={(e) => { setCityFilter(e.target.value); setPage(1); }}
            className="px-4 py-2 border border-slate-200 rounded-lg"
          >
            <option value="">所有城市</option>
            {data?.filters.cities.map(city => (
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
          <button
            type="submit"
            className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            搜尋
          </button>
        </form>
      </div>

      {/* 統計 */}
      {data && (
        <div className="text-sm text-slate-500">
          共 {data.pagination.total} 個景點
        </div>
      )}

      {/* 景點列表 */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">景點名稱</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">地點</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">分類</th>
                <th className="text-center px-4 py-3 text-sm font-medium text-slate-600">評分</th>
                <th className="text-center px-4 py-3 text-sm font-medium text-slate-600">認領狀態</th>
                <th className="text-center px-4 py-3 text-sm font-medium text-slate-600">狀態</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">更新時間</th>
                <th className="text-center px-4 py-3 text-sm font-medium text-slate-600">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data?.places.map((place) => (
                <tr key={place.id} className="hover:bg-slate-50">
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
                    {place.rating ? `${place.rating.toFixed(1)}` : '-'}
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
                    {formatTWDate(place.updated_at)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => handleToggleStatus(place.id)}
                      className={`px-3 py-1 text-xs rounded transition-colors ${
                        place.is_active
                          ? 'bg-red-50 text-red-600 hover:bg-red-100'
                          : 'bg-green-50 text-green-600 hover:bg-green-100'
                      }`}
                    >
                      {place.is_active ? '停用' : '啟用'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 分頁 */}
        {data && data.pagination.totalPages > 1 && (
          <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between">
            <div className="text-sm text-slate-500">
              第 {data.pagination.page} / {data.pagination.totalPages} 頁
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 border border-slate-200 rounded text-sm disabled:opacity-50"
              >
                上一頁
              </button>
              <button
                onClick={() => setPage(p => Math.min(data.pagination.totalPages, p + 1))}
                disabled={page >= data.pagination.totalPages}
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
