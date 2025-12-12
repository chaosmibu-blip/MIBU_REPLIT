import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { UserPlus, Users, Copy, Check, X, Link, Clock, Mail, Loader2 } from 'lucide-react';

interface Companion {
  id: number;
  orderId: number;
  userId: string;
  role: string;
  status: string;
  joinedAt: string;
}

interface Invite {
  id: number;
  orderId: number;
  inviterUserId: string;
  inviteeEmail: string | null;
  inviteCode: string;
  status: string;
  expiresAt: string;
  createdAt: string;
}

interface CompanionManagerProps {
  orderId: number;
  isOwner: boolean;
}

export const CompanionManager: React.FC<CompanionManagerProps> = ({ orderId, isOwner }) => {
  const [companions, setCompanions] = useState<Companion[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [creating, setCreating] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [showInviteForm, setShowInviteForm] = useState(false);

  const fetchData = async () => {
    try {
      const res = await fetch(`/api/planner/orders/${orderId}/companions`, {
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        setCompanions(data.companions || []);
        setInvites(data.invites || []);
      }
    } catch (err) {
      console.error('Error fetching companions:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [orderId]);

  const createInvite = async () => {
    setCreating(true);
    try {
      const res = await fetch(`/api/planner/orders/${orderId}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: inviteEmail || undefined }),
      });

      if (res.ok) {
        const data = await res.json();
        setInvites(prev => [data.invite, ...prev]);
        setInviteEmail('');
        setShowInviteForm(false);
      }
    } catch (err) {
      console.error('Error creating invite:', err);
    } finally {
      setCreating(false);
    }
  };

  const revokeInvite = async (inviteId: number) => {
    try {
      const res = await fetch(`/api/planner/invites/${inviteId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (res.ok) {
        setInvites(prev => prev.map(inv => 
          inv.id === inviteId ? { ...inv, status: 'revoked' } : inv
        ));
      }
    } catch (err) {
      console.error('Error revoking invite:', err);
    }
  };

  const removeCompanion = async (companionId: number) => {
    try {
      const res = await fetch(`/api/planner/orders/${orderId}/companions/${companionId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (res.ok) {
        setCompanions(prev => prev.filter(c => c.id !== companionId));
      }
    } catch (err) {
      console.error('Error removing companion:', err);
    }
  };

  const copyInviteLink = async (code: string) => {
    const link = `${window.location.origin}/join/${code}`;
    await navigator.clipboard.writeText(link);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs">等待中</span>;
      case 'accepted':
        return <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs">已接受</span>;
      case 'expired':
        return <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full text-xs">已過期</span>;
      case 'revoked':
        return <span className="px-2 py-0.5 bg-red-100 text-red-500 rounded-full text-xs">已取消</span>;
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader2 className="w-6 h-6 animate-spin text-amber-600" />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
      <div className="p-4 border-b border-stone-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-amber-600" />
          <h3 className="font-medium text-stone-800">旅伴管理</h3>
          <span className="text-sm text-stone-500">({companions.length}人)</span>
        </div>
        
        {isOwner && (
          <button
            onClick={() => setShowInviteForm(!showInviteForm)}
            className="flex items-center gap-1 px-3 py-1.5 bg-amber-100 text-amber-700 rounded-lg text-sm hover:bg-amber-200 transition-colors"
            data-testid="invite-companion-btn"
          >
            <UserPlus className="w-4 h-4" />
            邀請旅伴
          </button>
        )}
      </div>

      <AnimatePresence>
        {showInviteForm && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="p-4 bg-amber-50 border-b border-amber-100">
              <p className="text-sm text-stone-600 mb-3">
                建立邀請連結，分享給您的旅伴加入聊天室
              </p>
              <div className="flex gap-2">
                <input
                  type="email"
                  placeholder="旅伴 Email（選填）"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="flex-1 px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
                  data-testid="invite-email-input"
                />
                <button
                  onClick={createInvite}
                  disabled={creating}
                  className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50 flex items-center gap-2"
                  data-testid="create-invite-btn"
                >
                  {creating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Link className="w-4 h-4" />
                  )}
                  建立連結
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="divide-y divide-stone-100">
        {companions.length === 0 && invites.filter(i => i.status === 'pending').length === 0 ? (
          <div className="p-8 text-center text-stone-500">
            <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>尚未邀請任何旅伴</p>
            {isOwner && (
              <p className="text-sm mt-1">點擊「邀請旅伴」開始分享</p>
            )}
          </div>
        ) : (
          <>
            {companions.map((companion) => (
              <div key={companion.id} className="p-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                    <Check className="w-4 h-4 text-green-600" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-stone-800">
                      {companion.role === 'owner' ? '主揪' : '旅伴'}
                    </div>
                    <div className="text-xs text-stone-500">
                      {new Date(companion.joinedAt).toLocaleDateString('zh-TW')} 加入
                    </div>
                  </div>
                </div>
                
                {isOwner && companion.role !== 'owner' && (
                  <button
                    onClick={() => removeCompanion(companion.id)}
                    className="p-1.5 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    data-testid={`remove-companion-${companion.id}`}
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}

            {invites.filter(i => i.status === 'pending').map((invite) => (
              <div key={invite.id} className="p-3 flex items-center justify-between bg-amber-50/50">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center">
                    <Clock className="w-4 h-4 text-amber-600" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      {invite.inviteeEmail ? (
                        <span className="text-sm text-stone-700">{invite.inviteeEmail}</span>
                      ) : (
                        <span className="text-sm text-stone-500">未指定對象</span>
                      )}
                      {getStatusBadge(invite.status)}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-stone-500">
                      <code className="px-1.5 py-0.5 bg-stone-100 rounded">{invite.inviteCode}</code>
                      <span>有效至 {new Date(invite.expiresAt).toLocaleDateString('zh-TW')}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => copyInviteLink(invite.inviteCode)}
                    className="p-1.5 text-stone-400 hover:text-amber-600 hover:bg-amber-100 rounded-lg transition-colors"
                    data-testid={`copy-invite-${invite.id}`}
                  >
                    {copiedCode === invite.inviteCode ? (
                      <Check className="w-4 h-4 text-green-500" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                  
                  {isOwner && (
                    <button
                      onClick={() => revokeInvite(invite.id)}
                      className="p-1.5 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      data-testid={`revoke-invite-${invite.id}`}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
};
