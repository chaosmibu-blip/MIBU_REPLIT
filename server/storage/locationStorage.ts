import { db } from "../db";
import { eq, and, sql } from "drizzle-orm";
import {
  countries,
  regions,
  districts,
  categories,
  subcategories,
  type Country,
  type Region,
  type District,
  type Category,
  type Subcategory,
} from "@shared/schema";

export const locationStorage = {
  async getCountries(): Promise<Country[]> {
    return await db
      .select()
      .from(countries)
      .where(eq(countries.isActive, true));
  },

  async getCountryById(countryId: number): Promise<Country | null> {
    const [country] = await db
      .select()
      .from(countries)
      .where(eq(countries.id, countryId));
    return country || null;
  },

  async getRegionById(regionId: number): Promise<Region | null> {
    const [region] = await db
      .select()
      .from(regions)
      .where(eq(regions.id, regionId));
    return region || null;
  },

  async getRegionsByCountry(countryId: number): Promise<Region[]> {
    return await db
      .select()
      .from(regions)
      .where(and(eq(regions.countryId, countryId), eq(regions.isActive, true)));
  },

  async getDistrictsByRegion(regionId: number): Promise<District[]> {
    return await db
      .select()
      .from(districts)
      .where(and(eq(districts.regionId, regionId), eq(districts.isActive, true)));
  },

  async getDistrictsByCountry(countryId: number): Promise<District[]> {
    const result = await db
      .select({ district: districts })
      .from(districts)
      .innerJoin(regions, eq(districts.regionId, regions.id))
      .where(and(eq(regions.countryId, countryId), eq(districts.isActive, true)));
    return result.map(r => r.district);
  },

  async getRandomDistrictByCountry(countryId: number): Promise<District | undefined> {
    const result = await db
      .select({ district: districts })
      .from(districts)
      .innerJoin(regions, eq(districts.regionId, regions.id))
      .where(and(eq(regions.countryId, countryId), eq(districts.isActive, true)))
      .orderBy(sql`RANDOM()`)
      .limit(1);
    return result[0]?.district;
  },

  async getRandomDistrictByRegion(regionId: number): Promise<District | undefined> {
    const [district] = await db
      .select()
      .from(districts)
      .where(and(eq(districts.regionId, regionId), eq(districts.isActive, true)))
      .orderBy(sql`RANDOM()`)
      .limit(1);
    return district;
  },

  async getDistrictWithParents(districtId: number): Promise<{ district: District; region: Region; country: Country } | undefined> {
    const result = await db
      .select({
        district: districts,
        region: regions,
        country: countries
      })
      .from(districts)
      .innerJoin(regions, eq(districts.regionId, regions.id))
      .innerJoin(countries, eq(regions.countryId, countries.id))
      .where(eq(districts.id, districtId))
      .limit(1);
    return result[0];
  },

  async getDistrictByNames(districtName: string, regionName: string, countryName: string): Promise<{ district: District; region: Region; country: Country } | undefined> {
    const result = await db
      .select({
        district: districts,
        region: regions,
        country: countries
      })
      .from(districts)
      .innerJoin(regions, eq(districts.regionId, regions.id))
      .innerJoin(countries, eq(regions.countryId, countries.id))
      .where(and(
        eq(districts.nameZh, districtName),
        eq(regions.nameZh, regionName),
        eq(countries.nameZh, countryName)
      ))
      .limit(1);
    return result[0];
  },

  async getCategories(): Promise<Category[]> {
    return await db
      .select()
      .from(categories)
      .where(eq(categories.isActive, true))
      .orderBy(categories.sortOrder);
  },

  async getCategoryByCode(code: string): Promise<Category | undefined> {
    const [category] = await db
      .select()
      .from(categories)
      .where(and(eq(categories.code, code), eq(categories.isActive, true)))
      .limit(1);
    return category;
  },

  async getCategoryByNameZh(nameZh: string): Promise<Category | undefined> {
    const [category] = await db
      .select()
      .from(categories)
      .where(and(eq(categories.nameZh, nameZh), eq(categories.isActive, true)))
      .limit(1);
    return category;
  },

  async getSubcategoryByNameZh(nameZh: string, categoryId?: number): Promise<Subcategory | undefined> {
    const conditions = [eq(subcategories.nameZh, nameZh), eq(subcategories.isActive, true)];
    if (categoryId) {
      conditions.push(eq(subcategories.categoryId, categoryId));
    }
    const [subcategory] = await db
      .select()
      .from(subcategories)
      .where(and(...conditions))
      .limit(1);
    return subcategory;
  },

  async getSubcategoriesByCategory(categoryId: number): Promise<Subcategory[]> {
    return await db
      .select()
      .from(subcategories)
      .where(and(eq(subcategories.categoryId, categoryId), eq(subcategories.isActive, true)));
  },

  async getRandomCategory(): Promise<Category | undefined> {
    const [category] = await db
      .select()
      .from(categories)
      .where(eq(categories.isActive, true))
      .orderBy(sql`RANDOM()`)
      .limit(1);
    return category;
  },

  async getRandomSubcategoryByCategory(categoryId: number): Promise<Subcategory | undefined> {
    const [subcategory] = await db
      .select()
      .from(subcategories)
      .where(and(eq(subcategories.categoryId, categoryId), eq(subcategories.isActive, true)))
      .orderBy(sql`RANDOM()`)
      .limit(1);
    return subcategory;
  },

  async getAllSubcategoriesWithCategory(): Promise<Array<Subcategory & { category: Category }>> {
    const results = await db
      .select({
        subcategory: subcategories,
        category: categories
      })
      .from(subcategories)
      .innerJoin(categories, eq(subcategories.categoryId, categories.id))
      .where(and(eq(subcategories.isActive, true), eq(categories.isActive, true)));
    
    return results.map(r => ({
      ...r.subcategory,
      category: r.category
    }));
  },
};
