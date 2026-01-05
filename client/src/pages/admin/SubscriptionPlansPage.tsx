import React, { useState, useEffect, useCallback } from 'react';
import { Language } from '../../types';

interface SubscriptionPlansPageProps {
  language: Language;
  t: Record<string, string>;
}

interface SubscriptionPlan {
  id: number;
  tier: string;
  name: string;
  nameEn: string;
  priceMonthly: number;
  priceYearly: number | null;
  pricePeriodLabel: string;
  features: string[];
  buttonText: string;
  highlighted: boolean;
  highlightLabel: string | null;
  stripeMonthlyPriceId: string | null;
  stripeYearlyPriceId: string | null;
  recurMonthlyProductId: string | null;
  recurYearlyProductId: string | null;
  maxPlaces: number;
  maxCoupons: number;
  hasAdvancedAnalytics: boolean;
  hasPriorityExposure: boolean;
  hasDedicatedSupport: boolean;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export const SubscriptionPlansPage: React.FC<SubscriptionPlansPageProps> = ({ language, t }) => {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [formData, setFormData] = useState({
    tier: '',
    name: '',
    nameEn: '',
    priceMonthly: 0,
    priceYearly: '',
    pricePeriodLabel: '/月',
    features: '',
    buttonText: '',
    highlighted: false,
    highlightLabel: '',
    stripeMonthlyPriceId: '',
    stripeYearlyPriceId: '',
    recurMonthlyProductId: '',
    recurYearlyProductId: '',
    maxPlaces: 1,
    maxCoupons: 5,
    hasAdvancedAnalytics: false,
    hasPriorityExposure: false,
    hasDedicatedSupport: false,
    isActive: true,
    sortOrder: 0,
  });

  const fetchPlans = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/subscription-plans', { credentials: 'include' });
      const data = await res.json();
      setPlans(data.plans || []);
    } catch (err) {
      console.error('Failed to fetch subscription plans', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  const resetForm = () => {
    setFormData({
      tier: '',
      name: '',
      nameEn: '',
      priceMonthly: 0,
      priceYearly: '',
      pricePeriodLabel: '/月',
      features: '',
      buttonText: '',
      highlighted: false,
      highlightLabel: '',
      stripeMonthlyPriceId: '',
      stripeYearlyPriceId: '',
      recurMonthlyProductId: '',
      recurYearlyProductId: '',
      maxPlaces: 1,
      maxCoupons: 5,
      hasAdvancedAnalytics: false,
      hasPriorityExposure: false,
      hasDedicatedSupport: false,
      isActive: true,
      sortOrder: 0,
    });
  };

  const handleEdit = (plan: SubscriptionPlan) => {
    setEditingPlan(plan);
    setFormData({
      tier: plan.tier,
      name: plan.name,
      nameEn: plan.nameEn,
      priceMonthly: plan.priceMonthly,
      priceYearly: plan.priceYearly?.toString() || '',
      pricePeriodLabel: plan.pricePeriodLabel,
      features: plan.features.join('\n'),
      buttonText: plan.buttonText,
      highlighted: plan.highlighted,
      highlightLabel: plan.highlightLabel || '',
      stripeMonthlyPriceId: plan.stripeMonthlyPriceId || '',
      stripeYearlyPriceId: plan.stripeYearlyPriceId || '',
      recurMonthlyProductId: plan.recurMonthlyProductId || '',
      recurYearlyProductId: plan.recurYearlyProductId || '',
      maxPlaces: plan.maxPlaces,
      maxCoupons: plan.maxCoupons,
      hasAdvancedAnalytics: plan.hasAdvancedAnalytics,
      hasPriorityExposure: plan.hasPriorityExposure,
      hasDedicatedSupport: plan.hasDedicatedSupport,
      isActive: plan.isActive,
      sortOrder: plan.sortOrder,
    });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!formData.tier.trim() || !formData.name.trim()) {
      setError('方案代碼和名稱為必填');
      return;
    }

    try {
      const url = editingPlan 
        ? `/api/admin/subscription-plans/${editingPlan.tier}` 
        : '/api/admin/subscription-plans';
      const method = editingPlan ? 'PUT' : 'POST';

      const payload = {
        tier: formData.tier,
        name: formData.name,
        nameEn: formData.nameEn,
        priceMonthly: formData.priceMonthly,
        priceYearly: formData.priceYearly ? parseInt(formData.priceYearly) : null,
        pricePeriodLabel: formData.pricePeriodLabel,
        features: formData.features.split('\n').filter(f => f.trim()),
        buttonText: formData.buttonText,
        highlighted: formData.highlighted,
        highlightLabel: formData.highlightLabel || null,
        stripeMonthlyPriceId: formData.stripeMonthlyPriceId || null,
        stripeYearlyPriceId: formData.stripeYearlyPriceId || null,
        recurMonthlyProductId: formData.recurMonthlyProductId || null,
        recurYearlyProductId: formData.recurYearlyProductId || null,
        maxPlaces: formData.maxPlaces,
        maxCoupons: formData.maxCoupons,
        hasAdvancedAnalytics: formData.hasAdvancedAnalytics,
        hasPriorityExposure: formData.hasPriorityExposure,
        hasDedicatedSupport: formData.hasDedicatedSupport,
        isActive: formData.isActive,
        sortOrder: formData.sortOrder,
      };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '操作失敗');
      }

      setSuccess(editingPlan ? '方案已更新' : '方案已新增');
      setShowForm(false);
      setEditingPlan(null);
      resetForm();
      fetchPlans();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleToggleActive = async (plan: SubscriptionPlan) => {
    try {
      const payload = {
        tier: plan.tier,
        name: plan.name,
        nameEn: plan.nameEn,
        priceMonthly: plan.priceMonthly,
        priceYearly: plan.priceYearly,
        pricePeriodLabel: plan.pricePeriodLabel,
        features: plan.features,
        buttonText: plan.buttonText,
        highlighted: plan.highlighted,
        highlightLabel: plan.highlightLabel,
        stripeMonthlyPriceId: plan.stripeMonthlyPriceId,
        stripeYearlyPriceId: plan.stripeYearlyPriceId,
        recurMonthlyProductId: plan.recurMonthlyProductId,
        recurYearlyProductId: plan.recurYearlyProductId,
        maxPlaces: plan.maxPlaces,
        maxCoupons: plan.maxCoupons,
        hasAdvancedAnalytics: plan.hasAdvancedAnalytics,
        hasPriorityExposure: plan.hasPriorityExposure,
        hasDedicatedSupport: plan.hasDedicatedSupport,
        isActive: !plan.isActive,
        sortOrder: plan.sortOrder,
      };

      const res = await fetch(`/api/admin/subscription-plans/${plan.tier}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '操作失敗');
      }

      setSuccess(`方案已${plan.isActive ? '停用' : '啟用'}`);
      fetchPlans();
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100 text-center">
        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
        <p className="text-slate-500">載入中...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">訂閱方案管理</h2>
          <p className="text-slate-500">管理商家訂閱方案設定與金流 ID</p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setEditingPlan(null);
            setShowForm(true);
          }}
          className="px-4 py-2 bg-indigo-500 text-white rounded-xl font-medium hover:bg-indigo-600 transition-colors"
          data-testid="button-add-plan"
        >
          + 新增方案
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl">
          {success}
        </div>
      )}

      {showForm && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          <h3 className="text-lg font-bold text-slate-800 mb-4">
            {editingPlan ? '編輯方案' : '新增方案'}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">方案代碼 (tier)</label>
                <input
                  type="text"
                  value={formData.tier}
                  onChange={(e) => setFormData({ ...formData, tier: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="例如：pro, premium"
                  disabled={!!editingPlan}
                  data-testid="input-tier"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">方案名稱</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="Pro"
                  data-testid="input-name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">英文名稱</label>
                <input
                  type="text"
                  value={formData.nameEn}
                  onChange={(e) => setFormData({ ...formData, nameEn: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="Pro"
                  data-testid="input-name-en"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">按鈕文字</label>
                <input
                  type="text"
                  value={formData.buttonText}
                  onChange={(e) => setFormData({ ...formData, buttonText: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="升級 Pro"
                  data-testid="input-button-text"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">月費 (NT$)</label>
                <input
                  type="number"
                  value={formData.priceMonthly}
                  onChange={(e) => setFormData({ ...formData, priceMonthly: parseInt(e.target.value) || 0 })}
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  data-testid="input-price-monthly"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">年費 (NT$)</label>
                <input
                  type="number"
                  value={formData.priceYearly}
                  onChange={(e) => setFormData({ ...formData, priceYearly: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="選填"
                  data-testid="input-price-yearly"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">價格標籤</label>
                <input
                  type="text"
                  value={formData.pricePeriodLabel}
                  onChange={(e) => setFormData({ ...formData, pricePeriodLabel: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="/月"
                  data-testid="input-price-label"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">功能列表（每行一項）</label>
              <textarea
                value={formData.features}
                onChange={(e) => setFormData({ ...formData, features: e.target.value })}
                className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                rows={4}
                placeholder="3 間店家&#10;20 張優惠券&#10;進階數據報表"
                data-testid="input-features"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">最大店家數</label>
                <input
                  type="number"
                  value={formData.maxPlaces}
                  onChange={(e) => setFormData({ ...formData, maxPlaces: parseInt(e.target.value) || 1 })}
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  data-testid="input-max-places"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">最大優惠券數</label>
                <input
                  type="number"
                  value={formData.maxCoupons}
                  onChange={(e) => setFormData({ ...formData, maxCoupons: parseInt(e.target.value) || 5 })}
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  data-testid="input-max-coupons"
                />
              </div>
            </div>

            <div className="border-t border-slate-200 pt-4">
              <h4 className="font-medium text-slate-700 mb-3">金流 ID 設定</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Stripe 月繳 Price ID</label>
                  <input
                    type="text"
                    value={formData.stripeMonthlyPriceId}
                    onChange={(e) => setFormData({ ...formData, stripeMonthlyPriceId: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono text-sm"
                    placeholder="price_xxx"
                    data-testid="input-stripe-monthly"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Stripe 年繳 Price ID</label>
                  <input
                    type="text"
                    value={formData.stripeYearlyPriceId}
                    onChange={(e) => setFormData({ ...formData, stripeYearlyPriceId: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono text-sm"
                    placeholder="price_xxx"
                    data-testid="input-stripe-yearly"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Recur 月繳 Product ID</label>
                  <input
                    type="text"
                    value={formData.recurMonthlyProductId}
                    onChange={(e) => setFormData({ ...formData, recurMonthlyProductId: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono text-sm"
                    placeholder="fpbnn9ah9090j7hxx5wcv7f4"
                    data-testid="input-recur-monthly"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Recur 年繳 Product ID</label>
                  <input
                    type="text"
                    value={formData.recurYearlyProductId}
                    onChange={(e) => setFormData({ ...formData, recurYearlyProductId: e.target.value })}
                    className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono text-sm"
                    placeholder="adkwbl9dya0wc6b53parl9yk"
                    data-testid="input-recur-yearly"
                  />
                </div>
              </div>
            </div>

            <div className="border-t border-slate-200 pt-4">
              <h4 className="font-medium text-slate-700 mb-3">顯示設定</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.highlighted}
                    onChange={(e) => setFormData({ ...formData, highlighted: e.target.checked })}
                    className="w-4 h-4 text-indigo-600 rounded"
                    data-testid="checkbox-highlighted"
                  />
                  <span className="text-sm text-slate-700">推薦標記</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.hasAdvancedAnalytics}
                    onChange={(e) => setFormData({ ...formData, hasAdvancedAnalytics: e.target.checked })}
                    className="w-4 h-4 text-indigo-600 rounded"
                    data-testid="checkbox-analytics"
                  />
                  <span className="text-sm text-slate-700">進階報表</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.hasPriorityExposure}
                    onChange={(e) => setFormData({ ...formData, hasPriorityExposure: e.target.checked })}
                    className="w-4 h-4 text-indigo-600 rounded"
                    data-testid="checkbox-exposure"
                  />
                  <span className="text-sm text-slate-700">優先曝光</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.hasDedicatedSupport}
                    onChange={(e) => setFormData({ ...formData, hasDedicatedSupport: e.target.checked })}
                    className="w-4 h-4 text-indigo-600 rounded"
                    data-testid="checkbox-support"
                  />
                  <span className="text-sm text-slate-700">專屬客服</span>
                </label>
              </div>
              <div className="mt-3">
                <label className="block text-sm font-medium text-slate-700 mb-1">推薦標籤文字</label>
                <input
                  type="text"
                  value={formData.highlightLabel}
                  onChange={(e) => setFormData({ ...formData, highlightLabel: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="推薦"
                  data-testid="input-highlight-label"
                />
              </div>
              <div className="mt-3">
                <label className="block text-sm font-medium text-slate-700 mb-1">排序順序</label>
                <input
                  type="number"
                  value={formData.sortOrder}
                  onChange={(e) => setFormData({ ...formData, sortOrder: parseInt(e.target.value) || 0 })}
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  data-testid="input-sort-order"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="submit"
                className="px-6 py-2 bg-indigo-500 text-white rounded-xl font-medium hover:bg-indigo-600 transition-colors"
                data-testid="button-submit-plan"
              >
                {editingPlan ? '更新方案' : '新增方案'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditingPlan(null);
                  resetForm();
                }}
                className="px-6 py-2 bg-slate-100 text-slate-600 rounded-xl font-medium hover:bg-slate-200 transition-colors"
                data-testid="button-cancel"
              >
                取消
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="space-y-4">
        {plans.map((plan) => (
          <div
            key={plan.id}
            className={`bg-white rounded-2xl p-6 shadow-sm border ${
              plan.isActive ? 'border-slate-100' : 'border-red-200 bg-red-50'
            }`}
            data-testid={`card-plan-${plan.tier}`}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-xl font-bold text-slate-800">{plan.name}</h3>
                  <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded-lg text-sm font-mono">
                    {plan.tier}
                  </span>
                  {plan.highlighted && (
                    <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded-lg text-sm font-medium">
                      {plan.highlightLabel || '推薦'}
                    </span>
                  )}
                  {!plan.isActive && (
                    <span className="px-2 py-1 bg-red-100 text-red-700 rounded-lg text-sm font-medium">
                      已停用
                    </span>
                  )}
                </div>
                <div className="flex items-baseline gap-1 mb-3">
                  <span className="text-3xl font-bold text-indigo-600">NT${plan.priceMonthly}</span>
                  <span className="text-slate-500">{plan.pricePeriodLabel}</span>
                  {plan.priceYearly && (
                    <span className="text-slate-400 text-sm ml-2">
                      (年繳 NT${plan.priceYearly})
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 mb-3">
                  {plan.features.map((feature, idx) => (
                    <span key={idx} className="px-2 py-1 bg-slate-100 text-slate-600 rounded-lg text-sm">
                      {feature}
                    </span>
                  ))}
                </div>
                <div className="text-sm text-slate-500 space-y-1">
                  <p>店家上限: {plan.maxPlaces} | 優惠券上限: {plan.maxCoupons}</p>
                  <div className="flex flex-wrap gap-3">
                    {plan.recurMonthlyProductId && (
                      <span className="font-mono text-xs bg-green-50 text-green-700 px-2 py-1 rounded">
                        Recur月: {plan.recurMonthlyProductId}
                      </span>
                    )}
                    {plan.recurYearlyProductId && (
                      <span className="font-mono text-xs bg-green-50 text-green-700 px-2 py-1 rounded">
                        Recur年: {plan.recurYearlyProductId}
                      </span>
                    )}
                    {plan.stripeMonthlyPriceId && (
                      <span className="font-mono text-xs bg-purple-50 text-purple-700 px-2 py-1 rounded">
                        Stripe月: {plan.stripeMonthlyPriceId}
                      </span>
                    )}
                    {plan.stripeYearlyPriceId && (
                      <span className="font-mono text-xs bg-purple-50 text-purple-700 px-2 py-1 rounded">
                        Stripe年: {plan.stripeYearlyPriceId}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleEdit(plan)}
                  className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl font-medium hover:bg-slate-200 transition-colors"
                  data-testid={`button-edit-${plan.tier}`}
                >
                  編輯
                </button>
                {plan.tier !== 'free' && (
                  <button
                    onClick={() => handleToggleActive(plan)}
                    className={`px-4 py-2 rounded-xl font-medium transition-colors ${
                      plan.isActive
                        ? 'bg-red-100 text-red-600 hover:bg-red-200'
                        : 'bg-green-100 text-green-600 hover:bg-green-200'
                    }`}
                    data-testid={`button-toggle-${plan.tier}`}
                  >
                    {plan.isActive ? '停用' : '啟用'}
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
