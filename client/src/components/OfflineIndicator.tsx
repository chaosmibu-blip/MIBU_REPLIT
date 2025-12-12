import React, { useState, useEffect } from 'react';
import { Wifi, WifiOff, Download, Trash2, Loader2, CheckCircle2, CloudOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface OfflineIndicatorProps {
  className?: string;
}

export const OfflineIndicator: React.FC<OfflineIndicatorProps> = ({ className = '' }) => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <AnimatePresence>
      {!isOnline && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className={`fixed top-16 left-1/2 -translate-x-1/2 z-50 ${className}`}
        >
          <div className="flex items-center gap-2 px-4 py-2 bg-amber-100 border border-amber-300 rounded-full shadow-lg">
            <WifiOff className="w-4 h-4 text-amber-600" />
            <span className="text-sm font-medium text-amber-800">離線模式</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

interface OfflineManagerProps {
  onClose: () => void;
}

export const OfflineManager: React.FC<OfflineManagerProps> = ({ onClose }) => {
  const [cacheStatus, setCacheStatus] = useState<{
    static: number;
    api: number;
    map: number;
    itineraries: number;
    places: number;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isClearing, setIsClearing] = useState(false);

  useEffect(() => {
    loadCacheStatus();
  }, []);

  const loadCacheStatus = async () => {
    setIsLoading(true);
    try {
      const { getCacheStatus } = await import('../lib/offlineStorage');
      const status = await getCacheStatus();
      setCacheStatus(status);
    } catch (error) {
      console.error('Failed to load cache status:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearCache = async () => {
    setIsClearing(true);
    try {
      const { clearAllOfflineData, sendMessageToSW } = await import('../lib/offlineStorage');
      await clearAllOfflineData();
      await sendMessageToSW({ type: 'CLEAR_MAP_CACHE' });
      await loadCacheStatus();
    } catch (error) {
      console.error('Failed to clear cache:', error);
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9 }}
        animate={{ scale: 1 }}
        exit={{ scale: 0.9 }}
        className="bg-white rounded-2xl p-6 max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-stone-800">離線資料管理</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-stone-100 rounded-lg transition-colors"
            data-testid="close-offline-manager"
          >
            ✕
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-8 h-8 animate-spin text-amber-600" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-stone-50 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Download className="w-4 h-4 text-stone-500" />
                  <span className="text-sm text-stone-500">已儲存行程</span>
                </div>
                <p className="text-2xl font-bold text-stone-800">
                  {cacheStatus?.itineraries || 0}
                </p>
              </div>
              
              <div className="bg-stone-50 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CloudOff className="w-4 h-4 text-stone-500" />
                  <span className="text-sm text-stone-500">地圖快取</span>
                </div>
                <p className="text-2xl font-bold text-stone-800">
                  {cacheStatus?.map || 0} 區塊
                </p>
              </div>
            </div>

            <div className="bg-amber-50 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="w-4 h-4 text-amber-600" />
                <span className="text-sm font-medium text-amber-800">離線功能已啟用</span>
              </div>
              <p className="text-sm text-amber-700">
                您的行程和地圖將自動快取，即使沒有網路也能查看。
              </p>
            </div>

            <button
              onClick={handleClearCache}
              disabled={isClearing}
              className="w-full flex items-center justify-center gap-2 py-3 border-2 border-red-200 text-red-600 rounded-xl hover:bg-red-50 transition-colors disabled:opacity-50"
              data-testid="clear-offline-cache"
            >
              {isClearing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
              清除所有離線資料
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
};

export const useOnlineStatus = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
};
