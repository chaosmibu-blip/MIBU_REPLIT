export interface TripPlan {
  id: number;
  userId: string;
  title: string;
  destination: string;
  startDate: string;
  endDate: string;
  status: 'draft' | 'planned' | 'in_progress' | 'completed';
  createdAt: string;
  updatedAt: string;
}

export interface TripDay {
  id: number;
  tripPlanId: number;
  dayNumber: number;
  date: string;
  title?: string;
  notes?: string;
}

export interface TripActivity {
  id: number;
  tripDayId: number;
  orderIndex: number;
  timeSlot: 'morning' | 'lunch' | 'afternoon' | 'dinner' | 'evening';
  placeName: string;
  placeId?: string;
  category?: string;
  subcategory?: string;
  description?: string;
  address?: string;
  duration?: number;
  notes?: string;
  isFromGacha: boolean;
}

export interface CreateTripRequest {
  title: string;
  destination: string;
  startDate: string;
  endDate: string;
  preferences?: string[];
}

export interface AddActivityRequest {
  tripDayId: number;
  placeName: string;
  placeId?: string;
  category?: string;
  subcategory?: string;
  description?: string;
  address?: string;
  timeSlot: TripActivity['timeSlot'];
  duration?: number;
  isFromGacha?: boolean;
}
