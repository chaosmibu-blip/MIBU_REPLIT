// API service for backend communication

export interface LoginData {
  name: string;
  email?: string;
  avatar?: string;
  provider?: string;
  providerId?: string;
}

export interface User {
  id: number;
  name: string;
  email: string | null;
  avatar: string | null;
  provider: string | null;
  providerId: string | null;
}

export interface Collection {
  id: number;
  userId: number;
  placeName: string;
  country: string;
  city: string;
  category: string | null;
  description: string | null;
  isCoupon: boolean;
  couponData: any;
  collectedAt: string;
  district?: string;
}

export interface Merchant {
  id: number;
  userId: number;
  name: string;
  email: string;
  subscriptionPlan: string;
  createdAt: string;
}

class APIService {
  private baseURL = '/api';

  // Auth
  async login(data: LoginData): Promise<User> {
    const response = await fetch(`${this.baseURL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    
    if (!response.ok) {
      throw new Error('Login failed');
    }
    
    const result = await response.json();
    return result.user;
  }

  async getUser(userId: number): Promise<User> {
    const response = await fetch(`${this.baseURL}/auth/user/${userId}`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch user');
    }
    
    const result = await response.json();
    return result.user;
  }

  // Collections
  async getCollections(userId: number): Promise<Collection[]> {
    const response = await fetch(`${this.baseURL}/collections/${userId}`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch collections');
    }
    
    const result = await response.json();
    return result.collections;
  }

  async addToCollection(collection: Partial<Collection>): Promise<Collection> {
    const response = await fetch(`${this.baseURL}/collections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(collection),
    });
    
    if (!response.ok) {
      throw new Error('Failed to add to collection');
    }
    
    const result = await response.json();
    return result.collection;
  }

  // Merchants
  async getMerchantByUserId(userId: number): Promise<Merchant | null> {
    const response = await fetch(`${this.baseURL}/merchant/user/${userId}`);
    
    if (response.status === 404) {
      return null;
    }
    
    if (!response.ok) {
      throw new Error('Failed to fetch merchant');
    }
    
    const result = await response.json();
    return result.merchant;
  }

  async createMerchant(merchant: Partial<Merchant>): Promise<Merchant> {
    const response = await fetch(`${this.baseURL}/merchant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(merchant),
    });
    
    if (!response.ok) {
      throw new Error('Failed to create merchant');
    }
    
    const result = await response.json();
    return result.merchant;
  }

  async updateMerchantPlan(merchantId: number, plan: string): Promise<Merchant> {
    const response = await fetch(`${this.baseURL}/merchant/${merchantId}/plan`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan }),
    });
    
    if (!response.ok) {
      throw new Error('Failed to update merchant plan');
    }
    
    const result = await response.json();
    return result.merchant;
  }

  // Home Content
  async getHomeContent(): Promise<HomeContentResponse> {
    const response = await fetch(`${this.baseURL}/home/content`);
    
    if (!response.ok) {
      throw new Error(`API Error: ${response.status}`);
    }
    
    return await response.json();
  }
}

// Home Content Types
export interface Announcement {
  id: number;
  content: string;
  isActive: boolean | null;
  createdAt: string | null;
}

export interface AppEvent {
  id: number;
  title: string;
  content: string | null;
  eventType: 'flash' | 'holiday';
  startDate: string;
  endDate: string;
  imageUrl: string | null;
  createdAt: string | null;
}

export interface HomeContentResponse {
  announcements: Announcement[];
  events: AppEvent[];
}

export const apiService = new APIService();
