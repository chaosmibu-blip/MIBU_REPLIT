import type { ModuleManifest } from '../../core/contracts';

export const tripPlannerManifest: ModuleManifest = {
  id: 'trip-planner',
  name: 'Trip Planner',
  nameZh: '旅程策劃師',
  description: 'AI-powered intelligent trip planning with customizable itineraries',
  version: '1.0.0',
  routes: {
    client: ['/planner', '/my-trips'],
    server: '/api/planner',
  },
  adminPanel: {
    component: 'TripPlannerAdmin',
    icon: 'Map',
    label: '旅程策劃管理',
  },
};
