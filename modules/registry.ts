import type { ModuleManifest } from '../core/contracts';
import { travelGachaManifest } from './travel-gacha/manifest';
import { tripPlannerManifest } from './trip-planner/manifest';
import { adminManifest } from './admin/manifest';

export const moduleRegistry: ModuleManifest[] = [
  travelGachaManifest,
  tripPlannerManifest,
  adminManifest,
];

export function getModule(id: string): ModuleManifest | undefined {
  return moduleRegistry.find(m => m.id === id);
}

export function getModulesByFeature(): ModuleManifest[] {
  return moduleRegistry.filter(m => m.id !== 'admin');
}

export function getAdminPanels(): Array<NonNullable<ModuleManifest['adminPanel']> & { moduleId: string }> {
  return moduleRegistry
    .filter(m => m.adminPanel)
    .map(m => ({ ...m.adminPanel!, moduleId: m.id }));
}
