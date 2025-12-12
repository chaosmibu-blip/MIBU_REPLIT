import type { ModuleManifest } from '../../core/contracts';

export const adminManifest: ModuleManifest = {
  id: 'admin',
  name: 'Admin Dashboard',
  nameZh: '管理中心',
  description: 'Unified admin dashboard for all modules',
  version: '1.0.0',
  routes: {
    client: ['/admin', '/merchant'],
    server: '/api/admin',
  },
};
