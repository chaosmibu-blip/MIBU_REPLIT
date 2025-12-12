export interface ModuleManifest {
  id: string;
  name: string;
  nameZh: string;
  description: string;
  version: string;
  routes: {
    client: string[];
    server: string;
  };
  adminPanel?: {
    component: string;
    icon: string;
    label: string;
  };
}

export interface ItineraryProvider {
  generateItinerary(params: {
    district: string;
    city: string;
    country: string;
    itemCount: number;
    language: string;
  }): Promise<any>;
}

export interface TripPlanProvider {
  createPlan(params: {
    destination: string;
    startDate: string;
    endDate: string;
    preferences: string[];
  }): Promise<any>;
}
