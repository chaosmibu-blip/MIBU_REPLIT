import React, { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { CheckCircle2, Loader2, XCircle, MessageCircle } from 'lucide-react';

export default function PaymentSuccess() {
  const [, setLocation] = useLocation();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [sessionDetails, setSessionDetails] = useState<any>(null);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('session_id');

    if (!sessionId) {
      setStatus('error');
      return;
    }

    fetch(`/api/stripe/checkout-session/${sessionId}`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to verify payment');
        return res.json();
      })
      .then(data => {
        if (data.session?.payment_status === 'paid') {
          setSessionDetails(data.session);
          setStatus('success');
        } else {
          setStatus('error');
        }
      })
      .catch(err => {
        console.error('Verification error:', err);
        setStatus('error');
      });
  }, []);

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-amber-50 to-stone-100 flex items-center justify-center p-4">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-amber-600 mx-auto mb-4" />
          <p className="text-stone-600">驗證付款中...</p>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-amber-50 to-stone-100 flex items-center justify-center p-4">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-white rounded-2xl p-8 max-w-md w-full text-center shadow-lg"
        >
          <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-stone-800 mb-2">付款驗證失敗</h1>
          <p className="text-stone-600 mb-6">
            無法驗證您的付款狀態。如果您已完成付款，請聯繫客服。
          </p>
          <button
            onClick={() => setLocation('/planner')}
            className="px-6 py-3 bg-amber-600 text-white rounded-xl font-medium hover:bg-amber-700"
            data-testid="return-to-planner"
          >
            返回策劃頁面
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 to-stone-100 flex items-center justify-center p-4">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-2xl p-8 max-w-md w-full text-center shadow-lg"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: "spring" }}
        >
          <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
        </motion.div>
        
        <h1 className="text-2xl font-bold text-stone-800 mb-2">付款成功！</h1>
        <p className="text-stone-600 mb-6">
          感謝您購買旅程策劃服務。我們正在為您配對策劃師，稍後將開啟專屬聊天室。
        </p>

        {sessionDetails && (
          <div className="bg-stone-50 rounded-xl p-4 mb-6 text-left">
            <div className="text-sm text-stone-500 mb-1">訂單編號</div>
            <div className="text-stone-800 font-mono text-sm truncate">
              {sessionDetails.id}
            </div>
          </div>
        )}

        <div className="space-y-3">
          <button
            onClick={() => setLocation('/planner/chat')}
            className="w-full px-6 py-3 bg-amber-600 text-white rounded-xl font-medium hover:bg-amber-700 flex items-center justify-center gap-2"
            data-testid="go-to-chat"
          >
            <MessageCircle className="w-5 h-5" />
            前往聊天室
          </button>
          
          <button
            onClick={() => setLocation('/planner')}
            className="w-full px-6 py-3 border-2 border-stone-200 rounded-xl font-medium hover:bg-stone-50"
            data-testid="return-to-planner"
          >
            返回策劃頁面
          </button>
        </div>
      </motion.div>
    </div>
  );
}
