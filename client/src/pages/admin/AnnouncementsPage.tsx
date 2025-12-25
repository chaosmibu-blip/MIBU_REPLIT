import React, { useState, useEffect, useCallback } from 'react';
import { Language } from '../../types';

interface AnnouncementsPageProps {
  language: Language;
  t: Record<string, string>;
}

interface Announcement {
  id: number;
  title: string;
  content: string;
  type: string;
  priority: number;
  isActive: boolean;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
}

const TYPE_OPTIONS = [
  { value: 'announcement', label: '一般公告', color: 'bg-blue-100 text-blue-700' },
  { value: 'flash_event', label: '限時活動', color: 'bg-amber-100 text-amber-700' },
  { value: 'holiday_event', label: '節慶活動', color: 'bg-green-100 text-green-700' },
];


export const AnnouncementsPage: React.FC<AnnouncementsPageProps> = ({ language, t }) => {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<Announcement | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [formData, setFormData] = useState({
    title: '',
    content: '',
    type: 'announcement',
    priority: 1,
    isActive: true,
    startDate: '',
    endDate: ''
  });

  const fetchAnnouncements = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/announcements', { credentials: 'include' });
      const data = await res.json();
      setAnnouncements(data.announcements || []);
    } catch (err) {
      console.error('Failed to fetch announcements', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAnnouncements();
  }, [fetchAnnouncements]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!formData.title.trim() || !formData.content.trim()) {
      setError('標題和內容為必填');
      return;
    }

    try {
      const url = editingItem ? `/api/admin/announcements/${editingItem.id}` : '/api/admin/announcements';
      const method = editingItem ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title: formData.title,
          content: formData.content,
          type: formData.type,
          priority: formData.priority,
          isActive: formData.isActive,
          startDate: formData.startDate ? new Date(formData.startDate).toISOString() : undefined,
          endDate: formData.endDate ? new Date(formData.endDate).toISOString() : null
        })
      });

      if (!res.ok) {
        const data = await res.json();
        let errorMsg = '操作失敗';
        if (data.error) {
          if (Array.isArray(data.error)) {
            errorMsg = data.error.map((e: any) => e.message || e.path?.join('.') || JSON.stringify(e)).join(', ');
          } else if (typeof data.error === 'string') {
            errorMsg = data.error;
          } else {
            errorMsg = JSON.stringify(data.error);
          }
        }
        throw new Error(errorMsg);
      }

      setSuccess(editingItem ? '公告已更新' : '公告已新增');
      setShowForm(false);
      setEditingItem(null);
      resetForm();
      fetchAnnouncements();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleEdit = (item: Announcement) => {
    setEditingItem(item);
    setFormData({
      title: item.title,
      content: item.content,
      type: item.type,
      priority: item.priority,
      isActive: item.isActive,
      startDate: item.startDate ? item.startDate.split('T')[0] : '',
      endDate: item.endDate ? item.endDate.split('T')[0] : ''
    });
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('確定要刪除此公告嗎？')) return;

    try {
      const res = await fetch(`/api/admin/announcements/${id}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (!res.ok) throw new Error('刪除失敗');
      setSuccess('公告已刪除');
      fetchAnnouncements();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleCleanup = async () => {
    if (!confirm('確定要清理所有過期公告嗎？')) return;

    try {
      const res = await fetch('/api/admin/announcements/cleanup', {
        method: 'POST',
        credentials: 'include'
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '清理失敗');
      setSuccess(`已清理 ${data.deleted || 0} 則過期公告`);
      fetchAnnouncements();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const resetForm = () => {
    setFormData({
      title: '',
      content: '',
      type: 'announcement',
      priority: 1,
      isActive: true,
      startDate: '',
      endDate: ''
    });
  };

  const getTypeInfo = (type: string) => {
    return TYPE_OPTIONS.find(t => t.value === type) || TYPE_OPTIONS[0];
  };


  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">公告管理</h1>
          <p className="text-slate-500 text-sm">管理系統公告與通知</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleCleanup}
            className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-medium hover:bg-slate-200 transition-colors"
            data-testid="button-cleanup"
          >
            清理過期
          </button>
          <button
            onClick={() => { setShowForm(true); setEditingItem(null); resetForm(); }}
            className="px-4 py-2 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600 transition-colors"
            data-testid="button-add-announcement"
          >
            新增公告
          </button>
        </div>
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
          <h2 className="font-bold text-slate-700 mb-4">{editingItem ? '編輯公告' : '新增公告'}</h2>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">標題</label>
              <input
                type="text"
                value={formData.title}
                onChange={e => setFormData(prev => ({ ...prev, title: e.target.value }))}
                placeholder="輸入公告標題"
                className="w-full px-4 py-2 border border-slate-200 rounded-xl"
                required
                data-testid="input-title"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">內容</label>
              <textarea
                value={formData.content}
                onChange={e => setFormData(prev => ({ ...prev, content: e.target.value }))}
                placeholder="輸入公告內容"
                rows={4}
                className="w-full px-4 py-2 border border-slate-200 rounded-xl"
                required
                data-testid="textarea-content"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">類型</label>
                <select
                  value={formData.type}
                  onChange={e => setFormData(prev => ({ ...prev, type: e.target.value }))}
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl"
                  data-testid="select-type"
                >
                  {TYPE_OPTIONS.map(opt => (
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
              <label htmlFor="isActive" className="text-sm text-slate-700">立即發布</label>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => { setShowForm(false); setEditingItem(null); }}
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
                {editingItem ? '更新' : '新增'}
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
        ) : announcements.length === 0 ? (
          <div className="p-8 text-center text-slate-500">
            尚無公告資料
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {announcements.map(item => {
              const typeInfo = getTypeInfo(item.type);
              return (
                <div key={item.id} className="p-4" data-testid={`announcement-item-${item.id}`}>
                  <div className="flex items-start gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`px-2 py-0.5 text-xs rounded ${typeInfo.color}`}>
                          {typeInfo.label}
                        </span>
                        <span className={`px-2 py-0.5 text-xs rounded ${item.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                          {item.isActive ? '已發布' : '草稿'}
                        </span>
                        <span className="text-xs text-slate-400">優先級 {item.priority}</span>
                      </div>
                      <h3 className="font-medium text-slate-800">{item.title}</h3>
                      <p className="text-sm text-slate-600 mt-1 line-clamp-2">{item.content}</p>
                      <div className="text-xs text-slate-400 mt-2">
                        {item.startDate && `開始: ${new Date(item.startDate).toLocaleDateString()}`}
                        {item.endDate && ` | 結束: ${new Date(item.endDate).toLocaleDateString()}`}
                      </div>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        onClick={() => handleEdit(item)}
                        className="px-3 py-1.5 text-sm bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors"
                        data-testid={`button-edit-${item.id}`}
                      >
                        編輯
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="px-3 py-1.5 text-sm bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                        data-testid={`button-delete-${item.id}`}
                      >
                        刪除
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
