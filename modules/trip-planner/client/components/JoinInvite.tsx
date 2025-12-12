import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Users, Check, X, Loader2, LogIn } from 'lucide-react';

interface JoinInviteProps {
  inviteCode: string;
  isAuthenticated: boolean;
  onLoginRequired: () => void;
  onSuccess: (orderId: number) => void;
  onBack: () => void;
}

export const JoinInvite: React.FC<JoinInviteProps> = ({
  inviteCode,
  isAuthenticated,
  onLoginRequired,
  onSuccess,
  onBack,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const acceptInvite = async () => {
    if (!isAuthenticated) {
      onLoginRequired();
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/planner/invites/${inviteCode}/accept`, {
        method: 'POST',
        credentials: 'include',
      });

      const data = await res.json();

      if (res.ok) {
        setSuccess(true);
        setTimeout(() => {
          onSuccess(data.orderId);
        }, 2000);
      } else {
        setError(data.error || '無法接受邀請');
      }
    } catch (err) {
      setError('網路錯誤，請稍後再試');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated && !success && !error) {
      acceptInvite();
    }
  }, [isAuthenticated]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 to-stone-100 flex items-center justify-center p-4">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center"
      >
        {loading ? (
          <div className="py-8">
            <Loader2 className="w-16 h-16 mx-auto text-amber-500 animate-spin mb-4" />
            <h2 className="text-xl font-bold text-stone-800 mb-2">正在加入行程...</h2>
            <p className="text-stone-500">請稍候</p>
          </div>
        ) : success ? (
          <div className="py-8">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', bounce: 0.5 }}
              className="w-20 h-20 mx-auto bg-green-100 rounded-full flex items-center justify-center mb-4"
            >
              <Check className="w-10 h-10 text-green-600" />
            </motion.div>
            <h2 className="text-xl font-bold text-stone-800 mb-2">成功加入行程！</h2>
            <p className="text-stone-500">正在前往聊天室...</p>
          </div>
        ) : error ? (
          <div className="py-8">
            <div className="w-20 h-20 mx-auto bg-red-100 rounded-full flex items-center justify-center mb-4">
              <X className="w-10 h-10 text-red-600" />
            </div>
            <h2 className="text-xl font-bold text-stone-800 mb-2">無法加入</h2>
            <p className="text-red-500 mb-6">{error}</p>
            <button
              onClick={onBack}
              className="px-6 py-2 bg-stone-200 text-stone-700 rounded-xl hover:bg-stone-300 transition-colors"
              data-testid="back-home-btn"
            >
              返回首頁
            </button>
          </div>
        ) : !isAuthenticated ? (
          <div className="py-8">
            <div className="w-20 h-20 mx-auto bg-amber-100 rounded-full flex items-center justify-center mb-4">
              <Users className="w-10 h-10 text-amber-600" />
            </div>
            <h2 className="text-xl font-bold text-stone-800 mb-2">您被邀請加入行程</h2>
            <p className="text-stone-500 mb-6">
              邀請碼：<code className="px-2 py-1 bg-stone-100 rounded">{inviteCode}</code>
            </p>
            <p className="text-sm text-stone-500 mb-6">
              請先登入以接受邀請
            </p>
            <button
              onClick={onLoginRequired}
              className="flex items-center gap-2 mx-auto px-6 py-3 bg-amber-600 text-white rounded-xl hover:bg-amber-700 transition-colors font-medium"
              data-testid="login-to-join-btn"
            >
              <LogIn className="w-5 h-5" />
              登入以加入行程
            </button>
          </div>
        ) : (
          <div className="py-8">
            <div className="w-20 h-20 mx-auto bg-amber-100 rounded-full flex items-center justify-center mb-4">
              <Users className="w-10 h-10 text-amber-600" />
            </div>
            <h2 className="text-xl font-bold text-stone-800 mb-2">加入行程</h2>
            <p className="text-stone-500 mb-6">
              邀請碼：<code className="px-2 py-1 bg-stone-100 rounded">{inviteCode}</code>
            </p>
            <button
              onClick={acceptInvite}
              className="px-6 py-3 bg-amber-600 text-white rounded-xl hover:bg-amber-700 transition-colors font-medium"
              data-testid="accept-invite-btn"
            >
              接受邀請
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
};
