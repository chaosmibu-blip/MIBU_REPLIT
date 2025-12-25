import React, { useState, useEffect, useCallback } from 'react';
import { Language } from '../../types';

interface AdsManagePageProps {
  language: Language;
  t: Record<string, string>;
}

interface Ad {
  id: number;
  slot: string;
  merchantId: number | null;
  imageUrl: string;
  linkUrl: string;
  priority: number;
  isActive: boolean;
  impressions: number;
  clicks: number;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
}

const SLOT_OPTIONS = [
  { value: 'home_banner', label: '首頁橫幅' },
  { value: 'gacha_result', label: '扭蛋結果' },
  { value: 'collection_bottom', label: '收藏頁底部' },
  { value: 'itinerary_top', label: '行程頁頂部' },
];

export const AdsManagePage: React.FC<AdsManagePageProps> = ({ language, t }) => {
  const [ads, setAds] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingAd, setEditingAd] = useState<Ad | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [formData, setFormData] = useState({
    slot: 'home_banner',
    imageUrl: '',
    linkUrl: '',
    priority: 1,
    isActive: true,
    startDate: '',
    endDate: ''
  });

  const fetchAds = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/ads', { credentials: 'include' });
      const data = await res.json();
      setAds(data.ads || []);
    } catch (err) {
      console.error('Failed to fetch ads', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAds();
  }, [fetchAds]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      const url = editingAd ? `/api/admin/ads/${editingAd.id}` : '/api/admin/ads';
      const method = editingAd ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          slot: formData.slot,
          imageUrl: formData.imageUrl,
          linkUrl: formData.linkUrl,
          priority: formData.priority,
          isActive: formData.isActive,
          startDate: formData.startDate || null,
          endDate: formData.endDate || null
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '操作失敗');
      }

      setSuccess(editingAd ? '廣告已更新' : '廣告已新增');
      setShowForm(false);
      setEditingAd(null);
      resetForm();
      fetchAds();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleEdit = (ad: Ad) => {
    setEditingAd(ad);
    setFormData({
      slot: ad.slot,
      imageUrl: ad.imageUrl,
      linkUrl: ad.linkUrl,
      priority: ad.priority,
      isActive: ad.isActive,
      startDate: ad.startDate ? ad.startDate.split('T')[0] : '',
      endDate: ad.endDate ? ad.endDate.split('T')[0] : ''
    });
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('確定要刪除此廣告嗎？')) return;

    try {
      const res = await fetch(`/api/admin/ads/${id}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (!res.ok) throw new Error('刪除失敗');
      setSuccess('廣告已刪除');
      fetchAds();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const resetForm = () => {
    setFormData({
      slot: 'home_banner',
      imageUrl: '',
      linkUrl: '',
      priority: 1,
      isActive: true,
      startDate: '',
      endDate: ''
    });
  };

  const getSlotLabel = (slot: string) => {
    return SLOT_OPTIONS.find(s => s.value === slot)?.label || slot;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">廣告管理</h1>
          <p className="text-slate-500 text-sm">管理 App 內的廣告版位</p>
        </div>
        <button
          onClick={() => { setShowForm(true); setEditingAd(null); resetForm(); }}
          className="px-4 py-2 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600 transition-colors"
          data-testid="button-add-ad"
        >
          新增廣告
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700" data-testid="text-error">
          {error}
        </div>
      )}

      {success && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-xl text-green-700" data-testid="text-success">
          {success}
        </div>
      )}

      {showForm && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          <h2 className="font-bold text-slate-700 mb-4">{editingAd ? '編輯廣告' : '新增廣告'}</h2>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">版位</label>
                <select
                  value={formData.slot}
                  onChange={e => setFormData(prev => ({ ...prev, slot: e.target.value }))}
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl"
                  data-testid="select-slot"
                >
                  {SLOT_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">優先級</label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={formData.priority}
                  onChange={e => setFormData(prev => ({ ...prev, priority: parseInt(e.target.value) || 1 }))}
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl"
                  data-testid="input-priority"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">圖片網址</label>
              <input
                type="url"
                value={formData.imageUrl}
                onChange={e => setFormData(prev => ({ ...prev, imageUrl: e.target.value }))}
                placeholder="https://example.com/image.jpg"
                className="w-full px-4 py-2 border border-slate-200 rounded-xl"
                required
                data-testid="input-image-url"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">點擊連結</label>
              <input
                type="url"
                value={formData.linkUrl}
                onChange={e => setFormData(prev => ({ ...prev, linkUrl: e.target.value }))}
                placeholder="https://example.com"
                className="w-full px-4 py-2 border border-slate-200 rounded-xl"
                required
                data-testid="input-link-url"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">開始日期</label>
                <input
                  type="date"
                  value={formData.startDate}
                  onChange={e => setFormData(prev => ({ ...prev, startDate: e.target.value }))}
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl"
                  data-testid="input-start-date"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">結束日期</label>
                <input
                  type="date"
                  value={formData.endDate}
                  onChange={e => setFormData(prev => ({ ...prev, endDate: e.target.value }))}
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl"
                  data-testid="input-end-date"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isActive"
                checked={formData.isActive}
                onChange={e => setFormData(prev => ({ ...prev, isActive: e.target.checked }))}
                className="w-4 h-4 text-blue-500 rounded"
                data-testid="checkbox-is-active"
              />
              <label htmlFor="isActive" className="text-sm text-slate-700">啟用廣告</label>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => { setShowForm(false); setEditingAd(null); }}
                className="flex-1 px-4 py-2 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 transition-colors"
                data-testid="button-cancel"
              >
                取消
              </button>
              <button
                type="submit"
                className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-xl hover:bg-blue-600 transition-colors"
                data-testid="button-submit"
              >
                {editingAd ? '更新' : '新增'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
            <p className="text-slate-500">載入中...</p>
          </div>
        ) : ads.length === 0 ? (
          <div className="p-8 text-center text-slate-500">
            尚無廣告資料
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {ads.map(ad => (
              <div key={ad.id} className="p-4 flex items-center gap-4" data-testid={`ad-item-${ad.id}`}>
                <div className="w-20 h-12 bg-slate-100 rounded-lg overflow-hidden flex-shrink-0">
                  {ad.imageUrl && (
                    <img src={ad.imageUrl} alt="" className="w-full h-full object-cover" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-800">{getSlotLabel(ad.slot)}</span>
                    <span className={`px-2 py-0.5 text-xs rounded ${ad.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                      {ad.isActive ? '啟用' : '停用'}
                    </span>
                  </div>
                  <div className="text-sm text-slate-500 truncate">{ad.linkUrl}</div>
                  <div className="text-xs text-slate-400 mt-1">
                    曝光 {ad.impressions} | 點擊 {ad.clicks} | 優先級 {ad.priority}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleEdit(ad)}
                    className="px-3 py-1.5 text-sm bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors"
                    data-testid={`button-edit-${ad.id}`}
                  >
                    編輯
                  </button>
                  <button
                    onClick={() => handleDelete(ad.id)}
                    className="px-3 py-1.5 text-sm bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                    data-testid={`button-delete-${ad.id}`}
                  >
                    刪除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
