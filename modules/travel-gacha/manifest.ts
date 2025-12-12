import type { ModuleManifest } from '../../core/contracts';

export const travelGachaManifest: ModuleManifest = {
  id: 'travel-gacha',
  name: 'Travel Gacha',
  nameZh: '行程扭蛋',
  description: 'Random AI-powered travel itinerary generator with gacha mechanics',
  version: '1.0.0',
  routes: {
    client: ['/gacha', '/collection'],
    server: '/api/gacha',
  },
  adminPanel: {
    component: 'TravelGachaAdmin',
    icon: 'Dice5',
    label: '行程扭蛋管理',
  },
};
