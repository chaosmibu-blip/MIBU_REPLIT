import { GachaResponse, GachaItem, Category } from "../types";

export const generateGachaItinerary = async (
  country: string,
  city: string,
  level: number,
  language: string,
  collectedNames: string[]
): Promise<{ data: GachaResponse; sources: any[] }> => {
  
  const response = await fetch('/api/generate-itinerary', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      country,
      city,
      level,
      language,
      collectedNames
    })
  });

  if (!response.ok) {
    throw new Error('Failed to generate itinerary');
  }

  const result = await response.json();
  return result;
};
