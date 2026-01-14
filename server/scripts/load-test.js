/**
 * MIBU Backend Load Test Script
 *
 * Target: DAU 1000 (concurrent ~100-150 users)
 * Tool: k6 (https://k6.io)
 *
 * Usage:
 *   k6 run server/scripts/load-test.js
 *   k6 run --env BASE_URL=http://localhost:5000 server/scripts/load-test.js
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { randomItem, randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

// ==================== Configuration ====================

const BASE_URL = __ENV.BASE_URL || 'https://gacha-travel--s8869420.replit.app';

// Test stages: Ramp-up -> Stable -> Peak -> Ramp-down
export const options = {
  stages: [
    // Stage 1: Ramp-up (1 minute to 50 users)
    { duration: '1m', target: 50 },
    // Stage 2: Stable (3 minutes at 100 users)
    { duration: '30s', target: 100 },
    { duration: '3m', target: 100 },
    // Stage 3: Peak (1 minute at 150 users)
    { duration: '30s', target: 150 },
    { duration: '1m', target: 150 },
    // Stage 4: Ramp-down (1 minute back to 0)
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    // Global thresholds
    'http_req_duration': ['p(95)<500'],  // P95 response time < 500ms
    'http_req_failed': ['rate<0.01'],    // Error rate < 1%

    // Per-endpoint thresholds
    'http_req_duration{endpoint:gacha_v3}': ['p(95)<2000'],      // Gacha can be slower (AI calls)
    'http_req_duration{endpoint:auth_user}': ['p(95)<300'],      // Auth should be fast
    'http_req_duration{endpoint:collections}': ['p(95)<400'],    // Collections read
    'http_req_duration{endpoint:places}': ['p(95)<300'],         // Places read
    'http_req_duration{endpoint:regions}': ['p(95)<200'],        // Regions read (cacheable)
    'http_req_duration{endpoint:coupons_pool}': ['p(95)<300'],   // Coupons pool read

    // Custom metrics thresholds
    'gacha_success_rate': ['rate>0.95'],   // Gacha should succeed 95%+ of the time
    'auth_success_rate': ['rate>0.99'],    // Auth should succeed 99%+ of the time
  },
};

// ==================== Custom Metrics ====================

const gachaSuccessRate = new Rate('gacha_success_rate');
const authSuccessRate = new Rate('auth_success_rate');
const gachaDuration = new Trend('gacha_duration', true);
const apiErrors = new Counter('api_errors');

// ==================== Test Data ====================

// Taiwan regions for testing
const TEST_REGIONS = [
  { id: 1, city: '台北市', countryId: 1 },
  { id: 2, city: '新北市', countryId: 1 },
  { id: 3, city: '台中市', countryId: 1 },
  { id: 4, city: '高雄市', countryId: 1 },
  { id: 5, city: '台南市', countryId: 1 },
];

// Sample place IDs (update based on your actual data)
const TEST_PLACE_IDS = [1, 2, 3, 5, 10, 20, 50, 100, 200, 500];

// Test user simulation (for authenticated endpoints)
// In production, you might generate these dynamically or use test accounts
const TEST_USERS = [
  { id: 'test_user_1', token: null },
  { id: 'test_user_2', token: null },
  { id: 'test_user_3', token: null },
];

// ==================== Helper Functions ====================

function getHeaders(token = null) {
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'User-Agent': 'k6-load-test/1.0',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

function checkResponse(res, name, expectedStatus = 200) {
  const success = check(res, {
    [`${name}: status is ${expectedStatus}`]: (r) => r.status === expectedStatus,
    [`${name}: response time < 5s`]: (r) => r.timings.duration < 5000,
    [`${name}: has valid JSON`]: (r) => {
      try {
        if (r.body) JSON.parse(r.body);
        return true;
      } catch {
        return false;
      }
    },
  });

  if (!success) {
    apiErrors.add(1);
    console.log(`[ERROR] ${name}: status=${res.status}, body=${res.body?.substring(0, 200)}`);
  }

  return success;
}

// ==================== API Test Functions ====================

/**
 * Test: GET /api/auth/user
 * Get current authenticated user
 */
function testAuthUser(token) {
  const res = http.get(`${BASE_URL}/api/auth/user`, {
    headers: getHeaders(token),
    tags: { endpoint: 'auth_user' },
  });

  const success = checkResponse(res, 'GET /api/auth/user', token ? 200 : 401);
  authSuccessRate.add(success);
  return res;
}

/**
 * Test: POST /api/gacha/itinerary/v3
 * Core gacha endpoint - pull itinerary
 */
function testGachaV3(token) {
  const region = randomItem(TEST_REGIONS);
  const payload = JSON.stringify({
    regionId: region.id,
    city: region.city,
    itemCount: randomIntBetween(5, 10),
    pace: randomItem(['relaxed', 'moderate', 'packed']),
    language: 'zh-TW',
  });

  const startTime = Date.now();
  const res = http.post(`${BASE_URL}/api/gacha/itinerary/v3`, payload, {
    headers: getHeaders(token),
    tags: { endpoint: 'gacha_v3' },
    timeout: '30s',  // Gacha may take longer due to AI
  });
  const duration = Date.now() - startTime;

  gachaDuration.add(duration);

  // Gacha can return 200 (success), 401 (no auth), 429 (rate limit)
  const isSuccess = res.status === 200 || res.status === 401;
  const success = check(res, {
    'Gacha V3: valid status': (r) => [200, 401, 429].includes(r.status),
    'Gacha V3: has itinerary or error': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.itinerary || body.error || body.success === false;
      } catch {
        return false;
      }
    },
  });

  gachaSuccessRate.add(isSuccess);

  if (!success) {
    apiErrors.add(1);
    console.log(`[GACHA ERROR] status=${res.status}, duration=${duration}ms`);
  }

  return res;
}

/**
 * Test: GET /api/collections
 * Get user's collection (requires auth)
 */
function testCollections(token) {
  const res = http.get(`${BASE_URL}/api/collections`, {
    headers: getHeaders(token),
    tags: { endpoint: 'collections' },
  });

  checkResponse(res, 'GET /api/collections', token ? 200 : 401);
  return res;
}

/**
 * Test: GET /api/seo/places/by-id/:id
 * Get place by ID (public endpoint)
 */
function testPlaceById() {
  const placeId = randomItem(TEST_PLACE_IDS);
  const res = http.get(`${BASE_URL}/api/seo/places/by-id/${placeId}`, {
    headers: getHeaders(),
    tags: { endpoint: 'places' },
  });

  // Place might not exist, so 404 is acceptable
  check(res, {
    'GET /api/seo/places/by-id: valid status': (r) => [200, 404].includes(r.status),
  });

  return res;
}

/**
 * Test: GET /api/locations/regions/:countryId
 * Get regions by country (public endpoint)
 */
function testRegions() {
  const countryId = 1;  // Taiwan
  const res = http.get(`${BASE_URL}/api/locations/regions/${countryId}`, {
    headers: getHeaders(),
    tags: { endpoint: 'regions' },
  });

  checkResponse(res, 'GET /api/locations/regions', 200);
  return res;
}

/**
 * Test: GET /api/coupons/region/:regionId/pool
 * Get coupon pool by region (public endpoint)
 */
function testCouponsPool() {
  const region = randomItem(TEST_REGIONS);
  const res = http.get(`${BASE_URL}/api/coupons/region/${region.id}/pool`, {
    headers: getHeaders(),
    tags: { endpoint: 'coupons_pool' },
  });

  checkResponse(res, 'GET /api/coupons/region/pool', 200);
  return res;
}

/**
 * Test: GET /api/locations/countries
 * Get all countries (public endpoint, warm-up)
 */
function testCountries() {
  const res = http.get(`${BASE_URL}/api/locations/countries`, {
    headers: getHeaders(),
    tags: { endpoint: 'countries' },
  });

  checkResponse(res, 'GET /api/locations/countries', 200);
  return res;
}

/**
 * Test: GET /api/seo/cities
 * Get all cities (public endpoint)
 */
function testSeoCities() {
  const res = http.get(`${BASE_URL}/api/seo/cities`, {
    headers: getHeaders(),
    tags: { endpoint: 'seo_cities' },
  });

  checkResponse(res, 'GET /api/seo/cities', 200);
  return res;
}

/**
 * Test: GET /api/announcements
 * Get active announcements (public endpoint)
 */
function testAnnouncements() {
  const res = http.get(`${BASE_URL}/api/announcements`, {
    headers: getHeaders(),
    tags: { endpoint: 'announcements' },
  });

  checkResponse(res, 'GET /api/announcements', 200);
  return res;
}

// ==================== Main Test Scenarios ====================

export function setup() {
  console.log('='.repeat(60));
  console.log('MIBU Backend Load Test');
  console.log(`Base URL: ${BASE_URL}`);
  console.log('='.repeat(60));

  // Warm-up: verify API is reachable
  const healthCheck = http.get(`${BASE_URL}/api/locations/countries`);
  if (healthCheck.status !== 200) {
    console.log(`[WARNING] API might be unavailable: ${healthCheck.status}`);
  } else {
    console.log('[OK] API is reachable');
  }

  return {};
}

export default function () {
  // Simulate realistic user behavior with weighted scenarios
  const scenario = Math.random();

  if (scenario < 0.05) {
    // 5%: Full user journey (browse -> gacha)
    group('Full User Journey', () => {
      testCountries();
      sleep(0.5);

      testRegions();
      sleep(0.5);

      testSeoCities();
      sleep(1);

      testPlaceById();
      sleep(0.5);

      // Attempt gacha (will fail without auth, but tests the endpoint)
      testGachaV3(null);
      sleep(1);
    });
  } else if (scenario < 0.25) {
    // 20%: Gacha attempt (core feature)
    group('Gacha Flow', () => {
      testGachaV3(null);
      sleep(randomIntBetween(2, 5));
    });
  } else if (scenario < 0.45) {
    // 20%: Browse places
    group('Browse Places', () => {
      testSeoCities();
      sleep(0.3);

      testPlaceById();
      sleep(0.5);

      testPlaceById();
      sleep(0.3);
    });
  } else if (scenario < 0.65) {
    // 20%: Browse regions and coupons
    group('Browse Regions', () => {
      testCountries();
      sleep(0.2);

      testRegions();
      sleep(0.3);

      testCouponsPool();
      sleep(0.3);
    });
  } else if (scenario < 0.80) {
    // 15%: Auth check (simulating app launch)
    group('Auth Check', () => {
      testAuthUser(null);  // No token = 401 expected
      sleep(0.5);

      testAnnouncements();
      sleep(0.3);
    });
  } else {
    // 20%: Quick API calls (high frequency)
    group('Quick API Calls', () => {
      testAnnouncements();
      sleep(0.1);

      testRegions();
      sleep(0.1);

      testCountries();
      sleep(0.1);
    });
  }

  // Random think time between iterations
  sleep(randomIntBetween(1, 3));
}

export function teardown(data) {
  console.log('='.repeat(60));
  console.log('Load Test Complete');
  console.log('='.repeat(60));
}

// ==================== Authenticated Test Scenario ====================
// Uncomment and modify if you have test JWT tokens

/*
export function authenticatedScenario() {
  const testToken = __ENV.TEST_JWT_TOKEN;

  if (!testToken) {
    console.log('[SKIP] No TEST_JWT_TOKEN provided, skipping authenticated tests');
    return;
  }

  group('Authenticated User Journey', () => {
    // Verify auth
    const authRes = testAuthUser(testToken);
    if (authRes.status !== 200) {
      console.log('[ERROR] Auth failed, skipping authenticated tests');
      return;
    }
    sleep(0.5);

    // Get collections
    testCollections(testToken);
    sleep(0.5);

    // Perform gacha
    testGachaV3(testToken);
    sleep(2);

    // Check collections again
    testCollections(testToken);
    sleep(0.5);
  });
}
*/
