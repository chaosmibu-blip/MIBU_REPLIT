import React, { useState, useEffect, useCallback } from 'react';
import { Language } from '../../types';
import { formatTWDate } from '../../lib/utils';

interface ExclusionsPageProps {
  language: Language;
  t: Record<string, string>;
}

interface Exclusion {
  id: number;
  googlePlaceId: string;
  placeName: string;
  reason: string;
  excludedAt: string;
  excludedBy: number | null;
}

export const ExclusionsPage: React.FC<ExclusionsPageProps> = ({ language, t }) => {
  const [exclusions, setExclusions] = useState<Exclusion[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const [formData, setFormData] = useState({
    googlePlaceId: '',
    placeName: '',
    reason: ''
  });

  const fetchExclusions = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/global-exclusions', { credentials: 'include' });
      const data = await res.json();
      setExclusions(data.exclusions || []);
    } catch (err) {
      console.error('Failed to fetch exclusions', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchExclusions();
  }, [fetchExclusions]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!formData.googlePlaceId.trim() || !formData.placeName.trim()) {
      setError('Google Place ID 和地點名稱為必填');
      return;
    }

    try {
      const res = await fetch('/api/admin/global-exclusions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(formData)
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '新增失敗');
      }

      setSuccess('已新增至全域排除清單');
      setShowForm(false);
      resetForm();
      fetchExclusions();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('確定要從排除清單中移除嗎？')) return;

    try {
      const res = await fetch(`/api/admin/global-exclusions/${id}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (!res.ok) throw new Error('刪除失敗');
      setSuccess('已從排除清單中移除');
      fetchExclusions();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const resetForm = () => {
    setFormData({
      googlePlaceId: '',
      placeName: '',
      reason: ''
    });
  };

  const filteredExclusions = exclusions.filter(e => 
    e.placeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.googlePlaceId.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (e.reason || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const REASON_PRESETS = [
    '非旅遊相關',
    '資訊不正確',
    '已永久關閉',
    '重複地點',
    '不適當內容',
    '用戶反饋排除'
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">全域排除管理</h1>
          <p className="text-slate-500 text-sm">管理不顯示在扭蛋池中的地點</p>
        </div>
        <button
          onClick={() => { setShowForm(true); resetForm(); }}
          className="px-4 py-2 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600 transition-colors"
          data-testid="button-add-exclusion"
        >
          新增排除
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
          <h2 className="font-bold text-slate-700 mb-4">新增排除地點</h2>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Google Place ID</label>
              <input
                type="text"
                value={formData.googlePlaceId}
                onChange={e => setFormData(prev => ({ ...prev, googlePlaceId: e.target.value }))}
                placeholder="例如: ChIJ..."
                className="w-full px-4 py-2 border border-slate-200 rounded-xl"
                required
                data-testid="input-google-place-id"
              />
              <p className="text-xs text-slate-500 mt-1">可從 Google Maps URL 或 API 回應中取得</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">地點名稱</label>
              <input
                type="text"
                value={formData.placeName}
                onChange={e => setFormData(prev => ({ ...prev, placeName: e.target.value }))}
                placeholder="輸入地點名稱以便識別"
                className="w-full px-4 py-2 border border-slate-200 rounded-xl"
                required
                data-testid="input-place-name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">排除原因</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {REASON_PRESETS.map(preset => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, reason: preset }))}
                    className={`px-3 py-1 text-sm rounded-lg transition-colors ${
                      formData.reason === preset
                        ? 'bg-blue-100 text-blue-700 border border-blue-300'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                    data-testid={`button-reason-${preset}`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={formData.reason}
                onChange={e => setFormData(prev => ({ ...prev, reason: e.target.value }))}
                placeholder="或輸入自訂原因"
                className="w-full px-4 py-2 border border-slate-200 rounded-xl"
                data-testid="input-reason"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
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
                新增
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-4 border-b border-slate-100">
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="搜尋地點名稱、ID 或原因..."
            className="w-full px-4 py-2 border border-slate-200 rounded-xl"
            data-testid="input-search"
          />
        </div>

        {loading ? (
          <div className="p-8 text-center">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
            <p className="text-slate-500">載入中...</p>
          </div>
        ) : filteredExclusions.length === 0 ? (
          <div className="p-8 text-center text-slate-500">
            {searchTerm ? '找不到符合的排除項目' : '尚無排除項目'}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            <div className="px-4 py-2 bg-slate-50 text-xs text-slate-500">
              共 {filteredExclusions.length} 筆排除項目
            </div>
            {filteredExclusions.map(item => (
              <div key={item.id} className="p-4 flex items-center gap-4" data-testid={`exclusion-item-${item.id}`}>
                <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-lg">🚫</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-slate-800">{item.placeName}</div>
                  <div className="text-xs text-slate-500 font-mono truncate">{item.googlePlaceId}</div>
                  {item.reason && (
                    <div className="text-sm text-slate-600 mt-1">
                      <span className="px-2 py-0.5 bg-slate-100 rounded text-xs">{item.reason}</span>
                    </div>
                  )}
                  <div className="text-xs text-slate-400 mt-1">
                    排除時間: {formatTWDate(item.excludedAt)}
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(item.id)}
                  className="px-3 py-1.5 text-sm bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors flex-shrink-0"
                  data-testid={`button-delete-${item.id}`}
                >
                  移除
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
