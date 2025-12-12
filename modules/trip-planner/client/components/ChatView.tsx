import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Plus, MessageCircle, Users, Loader2, RefreshCw, UserPlus, Copy, Check, ChevronLeft, MoreVertical, Image, Camera, Bookmark } from 'lucide-react';

interface Message {
  sid: string;
  author: string;
  body: string;
  dateCreated: Date;
  index: number;
}

interface Conversation {
  conversationSid: string;
  friendlyName: string;
  state: string;
  unreadMessagesCount: number;
  participantsCount?: number;
  lastMessage?: string;
  lastMessageTime?: Date;
}

interface ChatViewProps {
  language: string;
  userId?: string;
  isAuthenticated: boolean;
}

export const ChatView: React.FC<ChatViewProps> = ({ language, userId, isAuthenticated }) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [twilioClient, setTwilioClient] = useState<any>(null);
  const [activeConversation, setActiveConversation] = useState<any>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showMenuModal, setShowMenuModal] = useState(false);
  const [newChatName, setNewChatName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [inviting, setInviting] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const initializeTwilioClient = useCallback(async () => {
    if (!isAuthenticated) return;

    try {
      setLoading(true);
      setError(null);

      const tokenRes = await fetch('/api/chat/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });

      if (!tokenRes.ok) {
        throw new Error('無法取得聊天授權');
      }

      const { token } = await tokenRes.json();

      const { Client } = await import('@twilio/conversations');
      const client = await Client.create(token);
      
      console.log('Twilio client initialized');
      setTwilioClient(client);
      await loadConversations();

      client.on('tokenAboutToExpire', async () => {
        try {
          const res = await fetch('/api/chat/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include'
          });
          if (res.ok) {
            const { token: newToken } = await res.json();
            await client.updateToken(newToken);
          }
        } catch (err) {
          console.error('Token refresh error:', err);
        }
      });

    } catch (err: any) {
      console.error('Twilio init error:', err);
      setError(err.message || '聊天服務初始化失敗');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  const loadConversations = async () => {
    try {
      const res = await fetch('/api/chat/conversations', {
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations || []);
      }
    } catch (err) {
      console.error('Load conversations error:', err);
    }
  };

  useEffect(() => {
    initializeTwilioClient();
    return () => {
      if (twilioClient) {
        twilioClient.shutdown();
      }
    };
  }, [initializeTwilioClient]);

  const joinConversation = async (conversationSid: string) => {
    if (!twilioClient) return;

    try {
      setLoading(true);
      setSelectedConversation(conversationSid);

      const conversation = await twilioClient.getConversationBySid(conversationSid);
      setActiveConversation(conversation);

      const messagePaginator = await conversation.getMessages();
      const loadedMessages = messagePaginator.items.map((msg: any) => ({
        sid: msg.sid,
        author: msg.author,
        body: msg.body,
        dateCreated: msg.dateCreated,
        index: msg.index
      }));
      setMessages(loadedMessages);

      conversation.on('messageAdded', (msg: any) => {
        setMessages(prev => [...prev, {
          sid: msg.sid,
          author: msg.author,
          body: msg.body,
          dateCreated: msg.dateCreated,
          index: msg.index
        }]);
      });

    } catch (err) {
      console.error('Join conversation error:', err);
      setError('無法加入聊天室');
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!activeConversation || !newMessage.trim()) return;

    try {
      setSendingMessage(true);
      await activeConversation.sendMessage(newMessage.trim());
      setNewMessage('');
    } catch (err) {
      console.error('Send message error:', err);
      setError('訊息發送失敗');
    } finally {
      setSendingMessage(false);
    }
  };

  const createConversation = async () => {
    if (!newChatName.trim()) return;

    try {
      setLoading(true);
      const res = await fetch('/api/chat/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ friendlyName: newChatName.trim() })
      });

      if (res.ok) {
        const { conversationSid } = await res.json();
        await loadConversations();
        setShowCreateModal(false);
        setNewChatName('');
        joinConversation(conversationSid);
      } else {
        const data = await res.json();
        setError(data.error || '建立聊天室失敗');
      }
    } catch (err) {
      console.error('Create conversation error:', err);
      setError('建立聊天室失敗');
    } finally {
      setLoading(false);
    }
  };

  const inviteToConversation = async () => {
    if (!selectedConversation || !inviteEmail.trim()) return;

    try {
      setInviting(true);
      const res = await fetch(`/api/chat/conversations/${selectedConversation}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: inviteEmail.trim() })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.inviteLink) {
          setInviteLink(data.inviteLink);
        } else {
          setInviteEmail('');
          setShowInviteModal(false);
          setError(null);
        }
      } else {
        const data = await res.json();
        setError(data.error || '邀請失敗');
      }
    } catch (err) {
      console.error('Invite error:', err);
      setError('邀請失敗');
    } finally {
      setInviting(false);
    }
  };

  const copyInviteLink = async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch (err) {
      console.error('Copy failed:', err);
    }
  };

  const generateInviteLink = async () => {
    if (!selectedConversation) return;

    try {
      setInviting(true);
      const res = await fetch(`/api/chat/conversations/${selectedConversation}/invite-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });

      if (res.ok) {
        const data = await res.json();
        setInviteLink(data.inviteLink);
      } else {
        const data = await res.json();
        setError(data.error || '產生邀請連結失敗');
      }
    } catch (err) {
      console.error('Generate invite link error:', err);
      setError('產生邀請連結失敗');
    } finally {
      setInviting(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const formatMessageDate = (date: Date) => {
    const now = new Date();
    const messageDate = new Date(date);
    const diffDays = Math.floor((now.getTime() - messageDate.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      return messageDate.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
      return '昨天';
    } else if (diffDays < 7) {
      const days = ['日', '一', '二', '三', '四', '五', '六'];
      return `週${days[messageDate.getDay()]}`;
    } else {
      return messageDate.toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' });
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center bg-gradient-to-b from-[#06C755]/10 to-white">
        <div className="w-24 h-24 bg-[#06C755] rounded-full flex items-center justify-center mb-6 shadow-lg">
          <MessageCircle className="w-12 h-12 text-white" />
        </div>
        <h2 className="text-2xl font-bold text-slate-800 mb-3">歡迎使用聊天功能</h2>
        <p className="text-slate-500 mb-8">登入後即可與旅伴即時通訊</p>
        <a
          href="/api/login"
          className="px-8 py-4 bg-[#06C755] text-white rounded-full font-bold text-lg hover:bg-[#05B04A] transition-colors shadow-lg"
          data-testid="button-login-chat"
        >
          登入開始聊天
        </a>
      </div>
    );
  }

  if (loading && !twilioClient) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] bg-white">
        <Loader2 className="w-10 h-10 text-[#06C755] animate-spin mb-4" />
        <p className="text-slate-500">正在連接聊天服務...</p>
      </div>
    );
  }

  if (error && !twilioClient) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center bg-white">
        <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mb-4">
          <MessageCircle className="w-10 h-10 text-red-500" />
        </div>
        <h2 className="text-xl font-bold text-slate-800 mb-2">連接失敗</h2>
        <p className="text-slate-500 mb-6">{error}</p>
        <button
          onClick={initializeTwilioClient}
          className="px-6 py-3 bg-[#06C755] text-white rounded-full font-medium hover:bg-[#05B04A] transition-colors flex items-center gap-2"
          data-testid="button-retry-chat"
        >
          <RefreshCw className="w-4 h-4" />
          重試
        </button>
      </div>
    );
  }

  if (!selectedConversation) {
    return (
      <div className="min-h-[60vh] bg-white">
        <div className="sticky top-0 z-10 bg-white border-b border-slate-100">
          <div className="flex items-center justify-between px-4 py-4">
            <h2 className="text-xl font-bold text-slate-800">聊天</h2>
            <button
              onClick={() => setShowCreateModal(true)}
              className="p-2 bg-[#06C755] text-white rounded-full hover:bg-[#05B04A] transition-colors shadow-md"
              data-testid="button-create-chat"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
        </div>

        {conversations.length === 0 ? (
          <div className="text-center py-16 px-6">
            <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Users className="w-10 h-10 text-slate-400" />
            </div>
            <h3 className="text-lg font-medium text-slate-800 mb-2">還沒有聊天室</h3>
            <p className="text-slate-500 mb-6">建立聊天室，邀請旅伴一起規劃旅程</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-6 py-3 bg-[#06C755] text-white rounded-full font-medium hover:bg-[#05B04A] transition-colors shadow-md"
              data-testid="button-create-first-chat"
            >
              建立聊天室
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {conversations.map(conv => (
              <button
                key={conv.conversationSid}
                onClick={() => joinConversation(conv.conversationSid)}
                className="w-full p-4 text-left hover:bg-slate-50 transition-colors flex items-center gap-3"
                data-testid={`chat-room-${conv.conversationSid}`}
              >
                <div className="w-14 h-14 bg-[#06C755] rounded-full flex items-center justify-center flex-shrink-0">
                  <MessageCircle className="w-7 h-7 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-slate-800 truncate">{conv.friendlyName || '聊天室'}</h3>
                    {conv.lastMessageTime && (
                      <span className="text-xs text-slate-400 ml-2 flex-shrink-0">
                        {formatMessageDate(conv.lastMessageTime)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-sm text-slate-500 truncate">
                      {conv.lastMessage || '點擊開始對話'}
                    </p>
                    {conv.unreadMessagesCount > 0 && (
                      <span className="ml-2 min-w-[20px] h-5 px-1.5 bg-[#06C755] text-white text-xs font-bold rounded-full flex items-center justify-center flex-shrink-0">
                        {conv.unreadMessagesCount > 99 ? '99+' : conv.unreadMessagesCount}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {showCreateModal && (
          <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50">
            <div className="bg-white rounded-t-3xl sm:rounded-2xl p-6 w-full sm:max-w-sm sm:mx-4 animate-slide-up">
              <h3 className="text-lg font-bold text-slate-800 mb-4">建立新聊天室</h3>
              <input
                type="text"
                value={newChatName}
                onChange={(e) => setNewChatName(e.target.value)}
                placeholder="輸入聊天室名稱"
                className="w-full px-4 py-4 rounded-xl border border-slate-200 mb-4 focus:ring-2 focus:ring-[#06C755] outline-none text-lg"
                data-testid="input-chat-name"
                autoFocus
              />
              <div className="flex gap-3">
                <button
                  onClick={() => { setShowCreateModal(false); setNewChatName(''); }}
                  className="flex-1 py-4 rounded-xl border border-slate-200 text-slate-600 font-medium hover:bg-slate-50"
                  data-testid="button-cancel-create"
                >
                  取消
                </button>
                <button
                  onClick={createConversation}
                  disabled={!newChatName.trim() || loading}
                  className="flex-1 py-4 rounded-xl bg-[#06C755] text-white font-bold hover:bg-[#05B04A] disabled:opacity-50"
                  data-testid="button-confirm-create"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : '建立'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  const currentConv = conversations.find(c => c.conversationSid === selectedConversation);

  return (
    <div className="flex flex-col h-[calc(100vh-180px)] bg-[#8CABD9]">
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-slate-200">
        <div className="flex items-center gap-3">
          <button
            onClick={() => { setSelectedConversation(null); setMessages([]); setActiveConversation(null); }}
            className="p-1.5 hover:bg-slate-100 rounded-full transition-colors"
            data-testid="button-back-chat-list"
          >
            <ChevronLeft className="w-6 h-6 text-slate-600" />
          </button>
          <div>
            <h3 className="font-semibold text-slate-800">{currentConv?.friendlyName || '聊天室'}</h3>
            <p className="text-xs text-slate-500">{currentConv?.participantsCount || 2} 位成員</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowInviteModal(true)}
            className="p-2 hover:bg-slate-100 rounded-full transition-colors"
            data-testid="button-invite-user"
            title="邀請成員"
          >
            <UserPlus className="w-5 h-5 text-slate-600" />
          </button>
          <button
            onClick={() => setShowMenuModal(true)}
            className="p-2 hover:bg-slate-100 rounded-full transition-colors"
            data-testid="button-chat-menu"
          >
            <MoreVertical className="w-5 h-5 text-slate-600" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-white/50 rounded-full flex items-center justify-center mx-auto mb-4">
              <MessageCircle className="w-8 h-8 text-white/80" />
            </div>
            <p className="text-white/80">開始對話吧！</p>
          </div>
        ) : (
          messages.map((msg, idx) => {
            const isMe = msg.author === userId;
            const showDate = idx === 0 || 
              new Date(messages[idx - 1].dateCreated).toDateString() !== new Date(msg.dateCreated).toDateString();
            
            return (
              <React.Fragment key={msg.sid}>
                {showDate && (
                  <div className="text-center my-4">
                    <span className="px-3 py-1 bg-black/20 text-white text-xs rounded-full">
                      {new Date(msg.dateCreated).toLocaleDateString('zh-TW', { 
                        year: 'numeric', 
                        month: 'long', 
                        day: 'numeric',
                        weekday: 'short'
                      })}
                    </span>
                  </div>
                )}
                <div className={`flex ${isMe ? 'justify-end' : 'justify-start'} items-end gap-2`}>
                  {!isMe && (
                    <div className="w-8 h-8 bg-slate-300 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-xs text-white font-medium">
                        {msg.author.slice(0, 1).toUpperCase()}
                      </span>
                    </div>
                  )}
                  <div className="flex flex-col max-w-[70%]">
                    {!isMe && (
                      <span className="text-xs text-white/70 mb-1 ml-1">{msg.author.slice(0, 8)}</span>
                    )}
                    <div className="flex items-end gap-1">
                      {isMe && (
                        <span className="text-[10px] text-white/60 mb-1">
                          {new Date(msg.dateCreated).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                      <div
                        className={`px-4 py-2.5 ${
                          isMe
                            ? 'bg-[#06C755] text-white rounded-2xl rounded-br-sm'
                            : 'bg-white text-slate-800 rounded-2xl rounded-bl-sm shadow-sm'
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words text-[15px]">{msg.body}</p>
                      </div>
                      {!isMe && (
                        <span className="text-[10px] text-white/60 mb-1">
                          {new Date(msg.dateCreated).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </React.Fragment>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-3 bg-white border-t border-slate-200">
        <div className="flex items-center gap-2">
          <button className="p-2 text-slate-400 hover:text-slate-600 transition-colors" data-testid="button-add-image">
            <Plus className="w-6 h-6" />
          </button>
          <div className="flex-1 relative">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="輸入訊息"
              className="w-full px-4 py-3 rounded-full border border-slate-200 focus:ring-2 focus:ring-[#06C755] outline-none pr-12 bg-slate-50"
              data-testid="input-message"
            />
            <button className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" data-testid="button-emoji">
              😊
            </button>
          </div>
          <button
            onClick={sendMessage}
            disabled={!newMessage.trim() || sendingMessage}
            className="p-3 bg-[#06C755] text-white rounded-full hover:bg-[#05B04A] disabled:opacity-50 disabled:bg-slate-300 transition-colors"
            data-testid="button-send-message"
          >
            {sendingMessage ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>

      {showInviteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl p-6 w-full sm:max-w-sm sm:mx-4 animate-slide-up">
            <h3 className="text-lg font-bold text-slate-800 mb-2">邀請成員</h3>
            <p className="text-sm text-slate-500 mb-4">分享連結邀請朋友加入聊天室</p>
            
            {inviteLink ? (
              <div className="space-y-4">
                <div className="p-3 bg-slate-100 rounded-xl break-all text-sm text-slate-600">
                  {inviteLink}
                </div>
                <button
                  onClick={copyInviteLink}
                  className="w-full py-4 rounded-xl bg-[#06C755] text-white font-bold hover:bg-[#05B04A] flex items-center justify-center gap-2"
                  data-testid="button-copy-invite-link"
                >
                  {linkCopied ? (
                    <>
                      <Check className="w-5 h-5" />
                      已複製
                    </>
                  ) : (
                    <>
                      <Copy className="w-5 h-5" />
                      複製連結
                    </>
                  )}
                </button>
              </div>
            ) : (
              <button
                onClick={generateInviteLink}
                disabled={inviting}
                className="w-full py-4 rounded-xl bg-[#06C755] text-white font-bold hover:bg-[#05B04A] disabled:opacity-50 flex items-center justify-center gap-2"
                data-testid="button-generate-invite-link"
              >
                {inviting ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <UserPlus className="w-5 h-5" />
                    產生邀請連結
                  </>
                )}
              </button>
            )}
            
            <button
              onClick={() => { setShowInviteModal(false); setInviteLink(null); setLinkCopied(false); }}
              className="w-full mt-3 py-4 rounded-xl border border-slate-200 text-slate-600 font-medium hover:bg-slate-50"
              data-testid="button-close-invite"
            >
              關閉
            </button>
          </div>
        </div>
      )}

      {showMenuModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50" onClick={() => setShowMenuModal(false)}>
          <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-sm sm:mx-4 animate-slide-up" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-800 text-center">{currentConv?.friendlyName}</h3>
            </div>
            <div className="p-2">
              <button className="w-full p-4 text-left hover:bg-slate-50 rounded-xl flex items-center gap-3" data-testid="button-chat-members">
                <Users className="w-5 h-5 text-slate-500" />
                <span className="text-slate-800">查看成員</span>
              </button>
              <button className="w-full p-4 text-left hover:bg-slate-50 rounded-xl flex items-center gap-3" data-testid="button-chat-bookmark">
                <Bookmark className="w-5 h-5 text-slate-500" />
                <span className="text-slate-800">收藏訊息</span>
              </button>
            </div>
            <div className="p-4 border-t border-slate-100">
              <button
                onClick={() => setShowMenuModal(false)}
                className="w-full py-4 rounded-xl border border-slate-200 text-slate-600 font-medium hover:bg-slate-50"
                data-testid="button-close-menu"
              >
                關閉
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatView;
