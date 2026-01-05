export const GACHA_DEDUP_LIMIT = 36;

export interface GuestSessionDedup {
  placeIds: number[];
  timestamp: number;
}

export const guestSessionDedup = new Map<string, GuestSessionDedup>();

export function cleanupGuestSessions(): void {
  const now = Date.now();
  const TTL = 30 * 60 * 1000;
  
  const entries = Array.from(guestSessionDedup.entries());
  for (const [key, value] of entries) {
    if (now - value.timestamp > TTL) {
      guestSessionDedup.delete(key);
    }
  }
}

export function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function weightedRandomSelect<T extends { weight?: number }>(items: T[], count: number): T[] {
  if (items.length <= count) return items;
  
  const selected: T[] = [];
  const remaining = [...items];
  
  for (let i = 0; i < count && remaining.length > 0; i++) {
    const totalWeight = remaining.reduce((sum, item) => sum + (item.weight || 1), 0);
    let random = Math.random() * totalWeight;
    
    for (let j = 0; j < remaining.length; j++) {
      random -= remaining[j].weight || 1;
      if (random <= 0) {
        selected.push(remaining[j]);
        remaining.splice(j, 1);
        break;
      }
    }
  }
  
  return selected;
}
