-- ============================================================
-- 將 place_cache 資料轉移到 places 表
-- 只轉移已驗證且有 Google Place ID 的資料
-- 使用 ON CONFLICT 避免重複
-- ============================================================

INSERT INTO places (
  place_name,
  country,
  city,
  district,
  address,
  location_lat,
  location_lng,
  google_place_id,
  rating,
  category,
  subcategory,
  description,
  is_active,
  is_promo_active
)
SELECT 
  COALESCE(verified_name, place_name) as place_name,
  country,
  city,
  district,
  verified_address as address,
  CASE WHEN location_lat ~ '^[0-9.]+$' THEN location_lat::double precision ELSE NULL END as location_lat,
  CASE WHEN location_lng ~ '^[0-9.]+$' THEN location_lng::double precision ELSE NULL END as location_lng,
  place_id as google_place_id,
  CASE WHEN google_rating ~ '^[0-9.]+$' THEN google_rating::double precision ELSE NULL END as rating,
  category,
  sub_category as subcategory,
  description,
  true as is_active,
  false as is_promo_active
FROM place_cache
WHERE 
  place_id IS NOT NULL 
  AND place_id != ''
  AND is_location_verified = true
  AND business_status IS DISTINCT FROM 'CLOSED_PERMANENTLY'
ON CONFLICT (google_place_id) DO NOTHING;

-- 顯示轉移結果
SELECT 'Migration complete. Total places: ' || COUNT(*) as result FROM places;
