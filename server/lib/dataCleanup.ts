import { db } from "../db";
import { places } from "@shared/schema";
import { eq, sql, and, isNotNull, or, like } from "drizzle-orm";

const SUFFIXES = [
  '售票處', '停車場', '遊客中心', '服務中心', '公廁', '廁所',
  '入口', '收費站', '管理處', '忘憂亭', '觀景台', '休息站',
  '販賣部', '紀念品店', '售票口', '驗票口', '候車亭', '管理站'
];

interface CleanupResult {
  renamedCount: number;
  deletedCount: number;
  renamedPlaces: Array<{ id: number; oldName: string; newName: string }>;
  deletedPlaces: Array<{ id: number; name: string; reason: string }>;
}

export async function runDataCleanup(): Promise<CleanupResult> {
  const result: CleanupResult = {
    renamedCount: 0,
    deletedCount: 0,
    renamedPlaces: [],
    deletedPlaces: []
  };

  console.log('[DataCleanup] Starting data cleanup...');

  const allPlaces = await db.select().from(places);

  const placesWithSuffix: Array<{
    id: number;
    placeName: string;
    suffix: string;
    coreName: string;
    rating: number | null;
    hasCoords: boolean;
    hasPhoto: boolean;
    hasDesc: boolean;
  }> = [];

  for (const place of allPlaces) {
    for (const suffix of SUFFIXES) {
      if (place.placeName.endsWith(suffix)) {
        const coreName = place.placeName.slice(0, -suffix.length).trim();
        if (coreName.length > 0) {
          placesWithSuffix.push({
            id: place.id,
            placeName: place.placeName,
            suffix,
            coreName,
            rating: place.rating,
            hasCoords: place.locationLat !== null && place.locationLng !== null,
            hasPhoto: place.photoReference !== null,
            hasDesc: place.description !== null
          });
        }
        break;
      }
    }
  }

  if (placesWithSuffix.length === 0) {
    console.log('[DataCleanup] No places with suffixes found. Cleanup complete.');
    return result;
  }

  console.log(`[DataCleanup] Found ${placesWithSuffix.length} places with suffixes to process`);

  const coreNameGroups = new Map<string, typeof placesWithSuffix>();

  for (const place of placesWithSuffix) {
    const key = place.coreName;
    if (!coreNameGroups.has(key)) {
      coreNameGroups.set(key, []);
    }
    coreNameGroups.get(key)!.push(place);
  }

  const existingCoreNames = new Map<string, typeof allPlaces[0]>();
  for (const place of allPlaces) {
    const isInSuffixList = placesWithSuffix.some(p => p.id === place.id);
    if (!isInSuffixList) {
      existingCoreNames.set(place.placeName, place);
    }
  }

  const coreNames = Array.from(coreNameGroups.keys());
  for (const coreName of coreNames) {
    const group = coreNameGroups.get(coreName)!;
    const existingPlace = existingCoreNames.get(coreName);

    if (existingPlace) {
      // Case 1: 已存在同名的核心名稱地點，刪除所有帶贅字的變體
      for (const place of group) {
        await db.delete(places).where(eq(places.id, place.id));
        result.deletedCount++;
        result.deletedPlaces.push({
          id: place.id,
          name: place.placeName,
          reason: `Duplicate of existing "${coreName}" (id=${existingPlace.id})`
        });
        console.log(`[DataCleanup] Deleted "${place.placeName}" (duplicate of "${coreName}")`);
      }
    } else if (group.length > 1) {
      // Case 2: 有多個帶贅字的變體，保留最佳的一個並改名
      type PlaceWithSuffix = typeof placesWithSuffix[0];
      const scored = group.map((p: PlaceWithSuffix) => ({
        ...p,
        score: (p.rating || 0) * 10 + (p.hasCoords ? 3 : 0) + (p.hasPhoto ? 2 : 0) + (p.hasDesc ? 1 : 0)
      }));
      scored.sort((a: typeof scored[0], b: typeof scored[0]) => b.score - a.score);

      const best = scored[0];
      const rest = scored.slice(1);

      await db.update(places)
        .set({ placeName: coreName })
        .where(eq(places.id, best.id));
      result.renamedCount++;
      result.renamedPlaces.push({
        id: best.id,
        oldName: best.placeName,
        newName: coreName
      });
      console.log(`[DataCleanup] Renamed "${best.placeName}" → "${coreName}"`);

      for (const dup of rest) {
        await db.delete(places).where(eq(places.id, dup.id));
        result.deletedCount++;
        result.deletedPlaces.push({
          id: dup.id,
          name: dup.placeName,
          reason: `Duplicate after normalization, kept id=${best.id}`
        });
        console.log(`[DataCleanup] Deleted "${dup.placeName}" (duplicate after normalization)`);
      }
    }
    // Case 3: 只有單獨一個帶贅字的地點，且沒有同名核心地點存在 → 保持不變
    // 例如「太平山觀景台」可能是一個獨立的合法景點，不應該改名
  }

  console.log(`[DataCleanup] Complete. Renamed: ${result.renamedCount}, Deleted: ${result.deletedCount}`);
  return result;
}
