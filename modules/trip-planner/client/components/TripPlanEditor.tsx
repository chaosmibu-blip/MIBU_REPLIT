import React, { useState, useEffect } from 'react';
import { ArrowLeft, Plus, Clock, MapPin, Trash2, GripVertical, Map as MapIcon } from 'lucide-react';
import { MibuMap } from './MibuMap';

interface TripActivity {
  id: number;
  placeName: string;
  placeId?: string;
  category?: string;
  subcategory?: string;
  description?: string;
  address?: string;
  timeSlot: string;
  duration?: number;
  isFromGacha: boolean;
}

interface TripDay {
  id: number;
  dayNumber: number;
  date: string;
  title?: string;
  activities: TripActivity[];
}

interface TripPlan {
  id: number;
  title: string;
  destination: string;
  startDate: string;
  endDate: string;
  status: string;
}

interface TripPlanEditorProps {
  planId: number;
  onBack: () => void;
}

export const TripPlanEditor: React.FC<TripPlanEditorProps> = ({
  planId,
  onBack,
}) => {
  const [plan, setPlan] = useState<TripPlan | null>(null);
  const [days, setDays] = useState<TripDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedDay, setExpandedDay] = useState<number | null>(null);
  const [showMap, setShowMap] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    fetchPlanDetails();
  }, [planId]);

  const fetchPlanDetails = async () => {
    try {
      const response = await fetch(`/api/planner/plans/${planId}`);
      if (response.ok) {
        const data = await response.json();
        setPlan(data.plan.plan);
        setDays(data.plan.days || []);
        if (data.plan.days?.length > 0) {
          setExpandedDay(data.plan.days[0].id);
        }
      }
    } catch (error) {
      console.error('Failed to fetch plan details:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-TW', { month: 'short', day: 'numeric', weekday: 'short' });
  };

  const getTimeSlotLabel = (slot: string) => {
    const labels: Record<string, string> = {
      morning: '上午',
      lunch: '午餐',
      afternoon: '下午',
      dinner: '晚餐',
      evening: '晚間',
    };
    return labels[slot] || slot;
  };

  const getTimeSlotColor = (slot: string) => {
    const colors: Record<string, string> = {
      morning: 'bg-amber-100 text-amber-700',
      lunch: 'bg-orange-100 text-orange-700',
      afternoon: 'bg-blue-100 text-blue-700',
      dinner: 'bg-purple-100 text-purple-700',
      evening: 'bg-indigo-100 text-indigo-700',
    };
    return colors[slot] || 'bg-slate-100 text-slate-700';
  };

  const handleDeleteActivity = async (activityId: number) => {
    try {
      const response = await fetch(`/api/planner/activities/${activityId}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        setDays(prev => prev.map(day => ({
          ...day,
          activities: day.activities.filter(a => a.id !== activityId),
        })));
      }
    } catch (error) {
      console.error('Failed to delete activity:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-600 mb-4">找不到此行程</p>
          <button onClick={onBack} className="text-indigo-600 font-medium">返回列表</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-lg mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="p-2 -ml-2 hover:bg-slate-100 rounded-lg transition-colors"
              data-testid="button-back-list"
            >
              <ArrowLeft className="w-5 h-5 text-slate-600" />
            </button>
            <div className="flex-1">
              <h1 className="font-bold text-slate-800">{plan.title}</h1>
              <p className="text-sm text-slate-500">{plan.destination}</p>
            </div>
            <button
              onClick={() => setShowMap(!showMap)}
              className={`p-2 rounded-lg transition-colors ${showMap ? 'bg-amber-100 text-amber-700' : 'hover:bg-slate-100 text-slate-600'}`}
              data-testid="button-toggle-map"
            >
              <MapIcon className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {showMap && (
        <div className="max-w-lg mx-auto px-4 pt-4">
          <MibuMap
            center={[121.5654, 25.0330]}
            zoom={12}
            markers={days.flatMap(day => 
              day.activities
                .filter(a => a.address)
                .map(a => ({
                  lng: 121.5654,
                  lat: 25.0330,
                  title: a.placeName,
                  description: a.address,
                }))
            )}
            onLocationUpdate={setUserLocation}
            showUserLocation={true}
            className="h-64 shadow-lg border-2 border-amber-200"
          />
          {userLocation && (
            <p className="text-xs text-slate-500 mt-2 text-center">
              📍 目前位置：{userLocation.lat.toFixed(4)}, {userLocation.lng.toFixed(4)}
            </p>
          )}
        </div>
      )}

      <main className="max-w-lg mx-auto px-4 py-4 pb-24">
        <div className="space-y-3">
          {days.map((day) => (
            <div
              key={day.id}
              className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden"
            >
              <button
                onClick={() => setExpandedDay(expandedDay === day.id ? null : day.id)}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors"
                data-testid={`day-header-${day.id}`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center">
                    <span className="text-sm font-bold text-indigo-600">{day.dayNumber}</span>
                  </div>
                  <div className="text-left">
                    <p className="font-medium text-slate-800">第 {day.dayNumber} 天</p>
                    <p className="text-xs text-slate-500">{formatDate(day.date)}</p>
                  </div>
                </div>
                <span className="text-xs text-slate-400">{day.activities.length} 個活動</span>
              </button>

              {expandedDay === day.id && (
                <div className="border-t border-slate-100 px-4 py-3 space-y-2">
                  {day.activities.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-4">還沒有安排活動</p>
                  ) : (
                    day.activities.map((activity) => (
                      <div
                        key={activity.id}
                        className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg group"
                        data-testid={`activity-${activity.id}`}
                      >
                        <GripVertical className="w-4 h-4 text-slate-300 mt-1 cursor-grab" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getTimeSlotColor(activity.timeSlot)}`}>
                              {getTimeSlotLabel(activity.timeSlot)}
                            </span>
                            {activity.isFromGacha && (
                              <span className="px-2 py-0.5 bg-pink-100 text-pink-600 rounded-full text-xs font-medium">
                                扭蛋
                              </span>
                            )}
                          </div>
                          <p className="font-medium text-slate-800 truncate">{activity.placeName}</p>
                          {activity.address && (
                            <p className="text-xs text-slate-500 truncate flex items-center gap-1 mt-1">
                              <MapPin className="w-3 h-3" />
                              {activity.address}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => handleDeleteActivity(activity.id)}
                          className="p-1 opacity-0 group-hover:opacity-100 hover:bg-red-100 rounded transition-all"
                          data-testid={`delete-activity-${activity.id}`}
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </button>
                      </div>
                    ))
                  )}
                  
                  <button
                    className="w-full py-2 border-2 border-dashed border-slate-200 rounded-lg text-sm text-slate-500 hover:border-indigo-300 hover:text-indigo-600 transition-colors flex items-center justify-center gap-1"
                    data-testid={`add-activity-day-${day.id}`}
                  >
                    <Plus className="w-4 h-4" />
                    新增活動
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
};
