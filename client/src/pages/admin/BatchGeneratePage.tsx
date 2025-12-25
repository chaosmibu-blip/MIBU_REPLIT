import React, { useState, useEffect } from 'react';
import { Language } from '../../types';

interface BatchGeneratePageProps {
  language: Language;
  t: Record<string, string>;
}

interface LocationOption {
  id: number;
  nameZh: string;
  nameEn: string;
}

interface PreviewPlace {
  name: string;
  address: string;
  rating: number;
  googlePlaceId: string;
  types: string[];
}

type ProgressStage = 
  | 'idle'
  | 'expanding_keywords'
  | 'searching_google'
  | 'filtering_results'
  | 'generating_descriptions'
  | 'saving_places'
  | 'complete';

interface ProgressState {
  stage: ProgressStage;
  current: number;
  total: number;
  message: string;
}

export const BatchGeneratePage: React.FC<BatchGeneratePageProps> = ({ language, t }) => {
  const [countries, setCountries] = useState<LocationOption[]>([]);
  const [regions, setRegions] = useState<LocationOption[]>([]);
  const [districts, setDistricts] = useState<LocationOption[]>([]);
  const [selectedCountryId, setSelectedCountryId] = useState<number | null>(null);
  const [selectedRegionId, setSelectedRegionId] = useState<number | null>(null);
  const [selectedDistrictId, setSelectedDistrictId] = useState<number | null>(null);
  const [keywords, setKeywords] = useState('');
  const [maxPages, setMaxPages] = useState(2);
  const [loading, setLoading] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [previewPlaces, setPreviewPlaces] = useState<PreviewPlace[]>([]);
  const [previewTotal, setPreviewTotal] = useState(0);
  const [generateResult, setGenerateResult] = useState<{ saved: number; skipped: number } | null>(null);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState<ProgressState>({
    stage: 'idle',
    current: 0,
    total: 0,
    message: ''
  });

  useEffect(() => {
    fetch('/api/locations/countries', { credentials: 'include' })
      .then(res => res.json())
      .then(data => setCountries(data.countries || []))
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (selectedCountryId) {
      fetch(`/api/locations/regions/${selectedCountryId}`, { credentials: 'include' })
        .then(res => res.json())
        .then(data => setRegions(data.regions || []))
        .catch(console.error);
      setSelectedRegionId(null);
      setSelectedDistrictId(null);
      setDistricts([]);
    }
  }, [selectedCountryId]);

  useEffect(() => {
    if (selectedRegionId) {
      fetch(`/api/locations/districts/${selectedRegionId}`, { credentials: 'include' })
        .then(res => res.json())
        .then(data => setDistricts(data.districts || []))
        .catch(console.error);
      setSelectedDistrictId(null);
    }
  }, [selectedRegionId]);

  const getLocationName = () => {
    const district = districts.find(d => d.id === selectedDistrictId);
    const region = regions.find(r => r.id === selectedRegionId);
    if (district && region) return `${region.nameZh} ${district.nameZh}`;
    if (region) return region.nameZh;
    return '';
  };

  // SSE 串流處理真實進度
  const handleSSEGenerate = async (body: object): Promise<{ saved: number; skipped: number; total: number } | null> => {
    return new Promise((resolve, reject) => {
      fetch('/api/admin/places/batch-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...body, useSSE: true })
      }).then(response => {
        if (!response.ok) {
          response.json().then(data => reject(new Error(data.error || '採集失敗')));
          return;
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) {
          reject(new Error('無法建立串流連線'));
          return;
        }

        const readStream = async () => {
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              const text = decoder.decode(value, { stream: true });
              const lines = text.split('\n');

              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  try {
                    const data = JSON.parse(line.slice(6));
                    
                    if (data.stage === 'done') {
                      resolve({ saved: data.saved, skipped: data.skipped, total: data.total });
                      return;
                    } else if (data.stage === 'error') {
                      reject(new Error(data.error));
                      return;
                    } else {
                      setProgress({
                        stage: data.stage as ProgressStage,
                        current: data.current || 0,
                        total: data.total || 0,
                        message: data.message || ''
                      });
                    }
                  } catch (e) {
                    // 忽略解析錯誤
                  }
                }
              }
            }
          } catch (e: any) {
            reject(e);
          }
        };

        readStream();
      }).catch(reject);
    });
  };

  const handlePreview = async () => {
    if (!selectedDistrictId || !keywords.trim()) {
      setError('請選擇地區並輸入關鍵字');
      return;
    }

    const keywordList = keywords.split(/[,，\n]/).map(k => k.trim()).filter(k => k);
    if (keywordList.length === 0) {
      setError('請輸入至少一個關鍵字');
      return;
    }
    if (keywordList.length > 5) {
      setError('預覽模式最多 5 個關鍵字');
      return;
    }

    setPreviewing(true);
    setError('');
    setPreviewPlaces([]);
    setPreviewTotal(0);
    setProgress({
      stage: 'searching_google',
      current: 0,
      total: keywordList.length,
      message: '正在搜尋 Google 地圖...'
    });

    try {
      const res = await fetch('/api/admin/places/batch-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          districtId: selectedDistrictId,
          keyword: keywordList.join(', '),
          maxPagesPerKeyword: Math.min(maxPages, 2)
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '預覽失敗');

      setPreviewPlaces(data.places || []);
      setPreviewTotal(data.total || 0);
      setProgress({ stage: 'complete', current: 0, total: 0, message: '預覽完成' });
    } catch (err: any) {
      setError(err.message);
      setProgress({ stage: 'idle', current: 0, total: 0, message: '' });
    } finally {
      setPreviewing(false);
    }
  };

  const handleGenerate = async () => {
    if (!selectedDistrictId || !keywords.trim()) {
      setError('請選擇地區並輸入關鍵字');
      return;
    }

    const keywordList = keywords.split(/[,，\n]/).map(k => k.trim()).filter(k => k);
    if (keywordList.length === 0) {
      setError('請輸入至少一個關鍵字');
      return;
    }
    if (keywordList.length > 10) {
      setError('批次生成最多 10 個關鍵字');
      return;
    }

    setLoading(true);
    setError('');
    setGenerateResult(null);
    setProgress({
      stage: 'expanding_keywords',
      current: 0,
      total: 0,
      message: '正在連線...'
    });

    try {
      // 使用 SSE 串流接收真實進度
      const result = await handleSSEGenerate({
        districtId: selectedDistrictId,
        keyword: keywordList.join(', '),
        maxPagesPerKeyword: Math.min(maxPages, 3)
      });

      if (result) {
        setGenerateResult({
          saved: result.saved,
          skipped: result.skipped
        });
        setProgress({ 
          stage: 'complete', 
          current: result.saved, 
          total: result.total, 
          message: `完成！儲存 ${result.saved} 筆` 
        });
      }
    } catch (err: any) {
      setError(err.message);
      setProgress({ stage: 'idle', current: 0, total: 0, message: '' });
    } finally {
      setLoading(false);
    }
  };

  const getProgressColor = () => {
    switch (progress.stage) {
      case 'expanding_keywords': return 'bg-purple-500';
      case 'searching_google': return 'bg-blue-500';
      case 'filtering_results': return 'bg-yellow-500';
      case 'generating_descriptions': return 'bg-orange-500';
      case 'saving_places': return 'bg-green-500';
      case 'complete': return 'bg-green-600';
      default: return 'bg-slate-300';
    }
  };

  const getProgressPercent = () => {
    if (progress.total === 0) return 0;
    return Math.round((progress.current / progress.total) * 100);
  };

  return (
    <div className="space-y-6">
      <div className="text-center py-4">
        <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
          <span className="text-2xl">🔍</span>
        </div>
        <h1 className="text-xl font-bold text-slate-800">批次採集地點</h1>
        <p className="text-slate-500 text-sm">從 Google Places API 批次採集地點資料</p>
      </div>

      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 space-y-4">
        <h2 className="font-bold text-slate-700">選擇地區</h2>
        
        <div className="grid grid-cols-3 gap-3">
          <select
            value={selectedCountryId || ''}
            onChange={e => setSelectedCountryId(parseInt(e.target.value) || null)}
            className="px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            data-testid="select-country"
          >
            <option value="">選擇國家</option>
            {countries.map(c => (
              <option key={c.id} value={c.id}>{c.nameZh}</option>
            ))}
          </select>

          <select
            value={selectedRegionId || ''}
            onChange={e => setSelectedRegionId(parseInt(e.target.value) || null)}
            disabled={!selectedCountryId}
            className="px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-slate-100"
            data-testid="select-region"
          >
            <option value="">選擇城市</option>
            {regions.map(r => (
              <option key={r.id} value={r.id}>{r.nameZh}</option>
            ))}
          </select>

          <select
            value={selectedDistrictId || ''}
            onChange={e => setSelectedDistrictId(parseInt(e.target.value) || null)}
            disabled={!selectedRegionId}
            className="px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-slate-100"
            data-testid="select-district"
          >
            <option value="">選擇鄉鎮區</option>
            {districts.map(d => (
              <option key={d.id} value={d.id}>{d.nameZh}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            搜尋關鍵字（每行一個，或用逗號分隔）
          </label>
          <textarea
            value={keywords}
            onChange={e => setKeywords(e.target.value)}
            placeholder="例如：&#10;咖啡廳&#10;日式料理&#10;夜市"
            rows={4}
            className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            data-testid="textarea-keywords"
          />
          <p className="text-xs text-slate-500 mt-1">預覽最多 5 個，生成最多 10 個</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            每個關鍵字最多頁數
          </label>
          <select
            value={maxPages}
            onChange={e => setMaxPages(parseInt(e.target.value))}
            className="px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            data-testid="select-max-pages"
          >
            <option value={1}>1 頁（約 20 筆）</option>
            <option value={2}>2 頁（約 40 筆）</option>
            <option value={3}>3 頁（約 60 筆）</option>
          </select>
        </div>

        {(loading || previewing) && progress.stage !== 'idle' && (
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3" data-testid="progress-container">
            <div className="flex items-center gap-3">
              <div className="animate-spin w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full"></div>
              <span className="text-sm font-medium text-slate-700" data-testid="progress-message">
                {progress.message}
              </span>
            </div>
            {progress.total > 0 && (
              <div className="space-y-1">
                <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                  <div 
                    className={`h-full transition-all duration-300 ${getProgressColor()}`}
                    style={{ width: `${getProgressPercent()}%` }}
                  />
                </div>
                <div className="text-xs text-slate-500 text-right">
                  {progress.current} / {progress.total} ({getProgressPercent()}%)
                </div>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700" data-testid="text-error">
            {error}
          </div>
        )}

        {generateResult && (
          <div className="p-4 bg-green-50 border border-green-200 rounded-xl text-green-700" data-testid="text-success">
            生成完成！儲存 {generateResult.saved} 筆，跳過 {generateResult.skipped} 筆（重複或排除）
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={handlePreview}
            disabled={previewing || loading || !selectedDistrictId}
            className="flex-1 px-6 py-3 bg-slate-100 text-slate-700 rounded-xl font-medium hover:bg-slate-200 transition-colors disabled:opacity-50"
            data-testid="button-preview"
          >
            {previewing ? '預覽中...' : '預覽結果'}
          </button>
          <button
            onClick={handleGenerate}
            disabled={loading || previewing || !selectedDistrictId}
            className="flex-1 px-6 py-3 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600 transition-colors disabled:opacity-50"
            data-testid="button-generate"
          >
            {loading ? '採集中...' : '開始採集'}
          </button>
        </div>
      </div>

      {previewPlaces.length > 0 && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-slate-700">預覽結果</h2>
            <span className="text-sm text-slate-500">共 {previewTotal} 筆</span>
          </div>
          
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
              {previewPlaces.slice(0, 20).map((place, idx) => (
                <div key={idx} className="px-4 py-2 flex items-center justify-between">
                  <div>
                    <div className="font-medium text-slate-800 text-sm">{place.name}</div>
                    <div className="text-xs text-slate-500">{place.address}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-amber-600">★ {place.rating || '-'}</span>
                    <span className="text-xs px-2 py-0.5 bg-slate-100 rounded text-slate-600">
                      {place.types?.[0] || '景點'}
                    </span>
                  </div>
                </div>
              ))}
              {previewPlaces.length > 20 && (
                <div className="px-4 py-2 text-center text-sm text-slate-500">
                  還有 {previewPlaces.length - 20} 筆...
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
