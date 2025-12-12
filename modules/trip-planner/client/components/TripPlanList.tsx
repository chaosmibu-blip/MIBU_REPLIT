import React, { useState, useEffect } from 'react';
import { ArrowLeft, Plus, Calendar, MapPin, ChevronRight } from 'lucide-react';

interface TripPlan {
  id: number;
  title: string;
  destination: string;
  startDate: string;
  endDate: string;
  status: string;
  createdAt: string;
}

interface TripPlanListProps {
  onSelectPlan: (planId: number) => void;
  onCreatePlan: () => void;
  onNavigateHome: () => void;
}

export const TripPlanList: React.FC<TripPlanListProps> = ({
  onSelectPlan,
  onCreatePlan,
  onNavigateHome,
}) => {
  const [plans, setPlans] = useState<TripPlan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPlans();
  }, []);

  const fetchPlans = async () => {
    try {
      const response = await fetch('/api/planner/plans');
      if (response.ok) {
        const data = await response.json();
        setPlans(data.plans || []);
      }
    } catch (error) {
      console.error('Failed to fetch plans:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' });
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      draft: '草稿',
      planned: '已規劃',
      in_progress: '進行中',
      completed: '已完成',
    };
    return labels[status] || status;
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      draft: 'bg-slate-100 text-slate-600',
      planned: 'bg-blue-100 text-blue-600',
      in_progress: 'bg-amber-100 text-amber-600',
      completed: 'bg-green-100 text-green-600',
    };
    return colors[status] || 'bg-slate-100 text-slate-600';
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <main className="max-w-lg mx-auto px-4 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          </div>
        ) : plans.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 mx-auto mb-4 bg-indigo-100 rounded-full flex items-center justify-center">
              <MapPin className="w-8 h-8 text-indigo-600" />
            </div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">還沒有行程</h2>
            <p className="text-slate-600 mb-6">開始規劃你的第一個旅程吧！</p>
            <button
              onClick={onCreatePlan}
              className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors"
              data-testid="button-create-first-trip"
            >
              建立新行程
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {plans.map((plan) => (
              <button
                key={plan.id}
                onClick={() => onSelectPlan(plan.id)}
                className="w-full bg-white rounded-xl p-4 shadow-sm border border-slate-200 hover:border-indigo-300 hover:shadow-md transition-all text-left"
                data-testid={`card-trip-${plan.id}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-bold text-slate-800 mb-1">{plan.title}</h3>
                    <div className="flex items-center gap-1 text-sm text-slate-500 mb-2">
                      <MapPin className="w-3.5 h-3.5" />
                      <span>{plan.destination}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1 text-xs text-slate-400">
                        <Calendar className="w-3 h-3" />
                        <span>{formatDate(plan.startDate)} - {formatDate(plan.endDate)}</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(plan.status)}`}>
                        {getStatusLabel(plan.status)}
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-400" />
                </div>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};
