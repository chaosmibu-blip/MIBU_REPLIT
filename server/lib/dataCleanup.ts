import { db } from "../db";
import { places, placeCache, placeDrafts } from "@shared/schema";
import { eq } from "drizzle-orm";

const SUFFIXES = [
  '售票處', '停車場', '遊客中心', '服務中心', '公廁', '廁所',
  '入口', '收費站', '管理處', '忘憂亭', '觀景台', '休息站',
  '販賣部', '紀念品店', '售票口', '驗票口', '候車亭', '管理站'
];

interface TableCleanupResult {
  tableName: string;
  renamedCount: number;
  deletedCount: number;
  renamedPlaces: Array<{ id: number; oldName: string; newName: string }>;
  deletedPlaces: Array<{ id: number; name: string; reason: string }>;
}

interface CleanupResult {
  places: TableCleanupResult;
  placeCache: TableCleanupResult;
  placeDrafts: TableCleanupResult;
  totalRenamed: number;
  totalDeleted: number;
}

type PlaceRecord = {
  id: number;
  placeName: string;
  rating?: number | null;
  locationLat?: number | string | null;
  locationLng?: number | string | null;
  photoReference?: string | null;
  description?: string | null;
  googleRating?: number | null;
  isLocationVerified?: boolean | null;
};

type PlaceWithSuffix = {
  id: number;
  placeName: string;
  suffix: string;
  coreName: string;
  score: number;
};

function findPlacesWithSuffix<T extends PlaceRecord>(records: T[]): PlaceWithSuffix[] {
  const result: PlaceWithSuffix[] = [];
  
  for (const record of records) {
    for (const suffix of SUFFIXES) {
      if (record.placeName.endsWith(suffix)) {
        const coreName = record.placeName.slice(0, -suffix.length).trim();
        if (coreName.length > 0) {
          const rating = record.rating ?? record.googleRating ?? 0;
          const hasCoords = (record.locationLat !== null && record.locationLat !== undefined) || 
                           (record.isLocationVerified === true);
          const hasPhoto = record.photoReference !== null && record.photoReference !== undefined;
          const hasDesc = record.description !== null && record.description !== undefined;
          
          result.push({
            id: record.id,
            placeName: record.placeName,
            suffix,
            coreName,
            score: (rating || 0) * 10 + (hasCoords ? 3 : 0) + (hasPhoto ? 2 : 0) + (hasDesc ? 1 : 0)
          });
        }
        break;
      }
    }
  }
  
  return result;
}

async function cleanupTable<T extends PlaceRecord>(
  tableName: string,
  allRecords: T[],
  deleteById: (id: number) => Promise<void>,
  updateName: (id: number, newName: string) => Promise<void>
): Promise<TableCleanupResult> {
  const result: TableCleanupResult = {
    tableName,
    renamedCount: 0,
    deletedCount: 0,
    renamedPlaces: [],
    deletedPlaces: []
  };

  const placesWithSuffix = findPlacesWithSuffix(allRecords);
  
  if (placesWithSuffix.length === 0) {
    return result;
  }

  console.log(`[DataCleanup:${tableName}] Found ${placesWithSuffix.length} records with suffixes`);

  const coreNameGroups = new Map<string, PlaceWithSuffix[]>();
  for (const place of placesWithSuffix) {
    if (!coreNameGroups.has(place.coreName)) {
      coreNameGroups.set(place.coreName, []);
    }
    coreNameGroups.get(place.coreName)!.push(place);
  }

  const existingCoreNames = new Set<string>();
  for (const record of allRecords) {
    const isInSuffixList = placesWithSuffix.some(p => p.id === record.id);
    if (!isInSuffixList) {
      existingCoreNames.add(record.placeName);
    }
  }

  const coreNames = Array.from(coreNameGroups.keys());
  for (const coreName of coreNames) {
    const group = coreNameGroups.get(coreName)!;
    const existsAsCore = existingCoreNames.has(coreName);

    if (existsAsCore) {
      for (const place of group) {
        await deleteById(place.id);
        result.deletedCount++;
        result.deletedPlaces.push({
          id: place.id,
          name: place.placeName,
          reason: `Duplicate of existing "${coreName}"`
        });
        console.log(`[DataCleanup:${tableName}] Deleted "${place.placeName}" (duplicate of "${coreName}")`);
      }
    } else if (group.length > 1) {
      group.sort((a, b) => b.score - a.score);
      const best = group[0];
      const rest = group.slice(1);

      await updateName(best.id, coreName);
      result.renamedCount++;
      result.renamedPlaces.push({
        id: best.id,
        oldName: best.placeName,
        newName: coreName
      });
      console.log(`[DataCleanup:${tableName}] Renamed "${best.placeName}" → "${coreName}"`);

      for (const dup of rest) {
        await deleteById(dup.id);
        result.deletedCount++;
        result.deletedPlaces.push({
          id: dup.id,
          name: dup.placeName,
          reason: `Duplicate after normalization, kept id=${best.id}`
        });
        console.log(`[DataCleanup:${tableName}] Deleted "${dup.placeName}" (duplicate)`);
      }
    }
  }

  return result;
}

export async function runDataCleanup(): Promise<CleanupResult> {
  console.log('[DataCleanup] Starting data cleanup for all tables...');

  const allPlaces = await db.select().from(places);
  const placesResult = await cleanupTable(
    'places',
    allPlaces,
    async (id) => { await db.delete(places).where(eq(places.id, id)); },
    async (id, name) => { await db.update(places).set({ placeName: name }).where(eq(places.id, id)); }
  );

  const allCache = await db.select().from(placeCache);
  const cacheResult = await cleanupTable(
    'place_cache',
    allCache,
    async (id) => { await db.delete(placeCache).where(eq(placeCache.id, id)); },
    async (id, name) => { await db.update(placeCache).set({ placeName: name }).where(eq(placeCache.id, id)); }
  );

  const allDrafts = await db.select().from(placeDrafts);
  const draftsResult = await cleanupTable(
    'place_drafts',
    allDrafts,
    async (id) => { await db.delete(placeDrafts).where(eq(placeDrafts.id, id)); },
    async (id, name) => { await db.update(placeDrafts).set({ placeName: name }).where(eq(placeDrafts.id, id)); }
  );

  const result: CleanupResult = {
    places: placesResult,
    placeCache: cacheResult,
    placeDrafts: draftsResult,
    totalRenamed: placesResult.renamedCount + cacheResult.renamedCount + draftsResult.renamedCount,
    totalDeleted: placesResult.deletedCount + cacheResult.deletedCount + draftsResult.deletedCount
  };

  console.log(`[DataCleanup] Complete. Total renamed: ${result.totalRenamed}, Total deleted: ${result.totalDeleted}`);
  return result;
}
