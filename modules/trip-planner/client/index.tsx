import React, { useState, useEffect } from 'react';
import { TripPlanList } from './components/TripPlanList';
import { TripPlanEditor } from './components/TripPlanEditor';
import { CreateTripModal } from './components/CreateTripModal';

interface TripPlannerProps {
  userId?: string;
  isAuthenticated: boolean;
  onNavigateHome: () => void;
}

export type TripPlannerView = 'list' | 'editor';

export const TripPlanner: React.FC<TripPlannerProps> = ({
  userId,
  isAuthenticated,
  onNavigateHome,
}) => {
  const [view, setView] = useState<TripPlannerView>('list');
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const handleSelectPlan = (planId: number) => {
    setSelectedPlanId(planId);
    setView('editor');
  };

  const handleBackToList = () => {
    setSelectedPlanId(null);
    setView('list');
  };

  const handleCreatePlan = () => {
    setShowCreateModal(true);
  };

  const handlePlanCreated = (planId: number) => {
    setShowCreateModal(false);
    setSelectedPlanId(planId);
    setView('editor');
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex items-center justify-center p-4">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-slate-800 mb-4">請先登入</h2>
          <p className="text-slate-600 mb-6">使用旅程策劃師需要登入帳號</p>
          <a
            href="/api/login"
            className="inline-block px-6 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors"
            data-testid="button-login"
          >
            登入
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      {view === 'list' && (
        <TripPlanList
          onSelectPlan={handleSelectPlan}
          onCreatePlan={handleCreatePlan}
          onNavigateHome={onNavigateHome}
        />
      )}
      
      {view === 'editor' && selectedPlanId && (
        <TripPlanEditor
          planId={selectedPlanId}
          onBack={handleBackToList}
        />
      )}

      {showCreateModal && (
        <CreateTripModal
          onClose={() => setShowCreateModal(false)}
          onCreated={handlePlanCreated}
        />
      )}
    </div>
  );
};

export default TripPlanner;
