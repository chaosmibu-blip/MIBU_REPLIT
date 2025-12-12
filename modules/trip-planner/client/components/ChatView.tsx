import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Plus, MessageCircle, Users, Loader2, RefreshCw } from 'lucide-react';

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
  const [newChatName, setNewChatName] = useState('');
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
      
      // Use Client.create() for proper async initialization
      const client = await Client.create(token);
      
      console.log('Twilio client initialized');
      setTwilioClient(client);
      
      // Load conversations after client is ready
      await loadConversations();

      // Set up token refresh handler
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

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
        <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mb-4">
          <MessageCircle className="w-10 h-10 text-emerald-600" />
        </div>
        <h2 className="text-xl font-bold text-slate-800 mb-2">請先登入</h2>
        <p className="text-slate-500 mb-6">使用聊天功能需要登入帳號</p>
        <a
          href="/api/login"
          className="px-6 py-3 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 transition-colors"
          data-testid="button-login-chat"
        >
          登入
        </a>
      </div>
    );
  }

  if (loading && !twilioClient) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin mb-4" />
        <p className="text-slate-500">正在連接聊天服務...</p>
      </div>
    );
  }

  if (error && !twilioClient) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
        <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mb-4">
          <MessageCircle className="w-10 h-10 text-red-500" />
        </div>
        <h2 className="text-xl font-bold text-slate-800 mb-2">連接失敗</h2>
        <p className="text-slate-500 mb-6">{error}</p>
        <button
          onClick={initializeTwilioClient}
          className="px-6 py-3 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 transition-colors flex items-center gap-2"
          data-testid="button-retry-chat"
        >
          <RefreshCw className="w-4 h-4" />
          重試
        </button>
      </div>
    );
  }

  // Conversation list view
  if (!selectedConversation) {
    return (
      <div className="min-h-[60vh] p-4">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-slate-800">聊天室</h2>
          <button
            onClick={() => setShowCreateModal(true)}
            className="p-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors"
            data-testid="button-create-chat"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>

        {conversations.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Users className="w-8 h-8 text-slate-400" />
            </div>
            <p className="text-slate-500 mb-4">還沒有聊天室</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition-colors"
              data-testid="button-create-first-chat"
            >
              建立第一個聊天室
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {conversations.map(conv => (
              <button
                key={conv.conversationSid}
                onClick={() => joinConversation(conv.conversationSid)}
                className="w-full p-4 bg-white rounded-xl border border-slate-200 text-left hover:bg-slate-50 transition-colors"
                data-testid={`chat-room-${conv.conversationSid}`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center">
                    <MessageCircle className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-medium text-slate-800">{conv.friendlyName || '聊天室'}</h3>
                    <p className="text-sm text-slate-500">
                      {conv.unreadMessagesCount > 0 && (
                        <span className="text-emerald-600 font-medium">
                          {conv.unreadMessagesCount} 則新訊息
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Create Chat Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl p-6 w-full max-w-sm">
              <h3 className="text-lg font-bold text-slate-800 mb-4">建立新聊天室</h3>
              <input
                type="text"
                value={newChatName}
                onChange={(e) => setNewChatName(e.target.value)}
                placeholder="聊天室名稱"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 mb-4 focus:ring-2 focus:ring-emerald-500 outline-none"
                data-testid="input-chat-name"
              />
              <div className="flex gap-3">
                <button
                  onClick={() => { setShowCreateModal(false); setNewChatName(''); }}
                  className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-600 font-medium hover:bg-slate-50"
                  data-testid="button-cancel-create"
                >
                  取消
                </button>
                <button
                  onClick={createConversation}
                  disabled={!newChatName.trim() || loading}
                  className="flex-1 py-3 rounded-xl bg-emerald-600 text-white font-medium hover:bg-emerald-700 disabled:opacity-50"
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

  // Chat room view
  const currentConv = conversations.find(c => c.conversationSid === selectedConversation);

  return (
    <div className="flex flex-col h-[calc(100vh-180px)]">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 bg-white border-b border-slate-200">
        <button
          onClick={() => { setSelectedConversation(null); setMessages([]); setActiveConversation(null); }}
          className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          data-testid="button-back-chat-list"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h3 className="font-medium text-slate-800">{currentConv?.friendlyName || '聊天室'}</h3>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="text-center py-8 text-slate-400">
            <p>開始對話吧！</p>
          </div>
        ) : (
          messages.map(msg => {
            const isMe = msg.author === userId;
            return (
              <div
                key={msg.sid}
                className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[75%] px-4 py-2 rounded-2xl ${
                    isMe
                      ? 'bg-emerald-600 text-white rounded-br-md'
                      : 'bg-slate-100 text-slate-800 rounded-bl-md'
                  }`}
                >
                  {!isMe && (
                    <p className="text-xs text-slate-500 mb-1">{msg.author.slice(0, 8)}...</p>
                  )}
                  <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                  <p className={`text-xs mt-1 ${isMe ? 'text-emerald-200' : 'text-slate-400'}`}>
                    {new Date(msg.dateCreated).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 bg-white border-t border-slate-200">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="輸入訊息..."
            className="flex-1 px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none"
            data-testid="input-message"
          />
          <button
            onClick={sendMessage}
            disabled={!newMessage.trim() || sendingMessage}
            className="p-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition-colors"
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
    </div>
  );
};

export default ChatView;
