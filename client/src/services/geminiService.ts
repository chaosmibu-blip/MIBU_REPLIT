import { GachaResponse } from "../types";

export const generateGachaItinerary = async (
  regionId: number | null,
  countryId: number | null,
  level: number,
  language: string,
  collectedNames: string[]
): Promise<{ data: GachaResponse; sources: any[] }> => {
  
  if (!regionId && !countryId) {
    throw new Error('regionId or countryId is required');
  }
  
  const response = await fetch('/api/generate-itinerary', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      regionId,
      countryId,
      level,
      language,
      collectedNames
    })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to generate itinerary' }));
    throw new Error(error.error || 'Failed to generate itinerary');
  }

  const result = await response.json();
  return result;
};
