-- Phase 1-6 資料表遷移 SQL
-- 在正式資料庫 (Production) 的 Neon Console 執行
-- 執行前請先備份資料庫！

-- ============ Phase 1: 經濟系統 ============

-- 等級定義表
CREATE TABLE IF NOT EXISTS level_definitions (
  level INTEGER PRIMARY KEY,
  required_exp INTEGER NOT NULL,
  title VARCHAR(50) NOT NULL,
  title_en VARCHAR(50),
  is_milestone BOOLEAN NOT NULL DEFAULT false,
  is_unlocked BOOLEAN NOT NULL DEFAULT true,
  perks JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 用戶等級表
CREATE TABLE IF NOT EXISTS user_levels (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  current_exp INTEGER NOT NULL DEFAULT 0,
  current_level INTEGER NOT NULL DEFAULT 1,
  specialist_invited_at TIMESTAMP,
  specialist_applied_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "IDX_user_levels_level" ON user_levels(current_level);

-- 經驗值交易記錄表
CREATE TABLE IF NOT EXISTS user_exp_transactions (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  amount INTEGER NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  reference_type VARCHAR(50),
  reference_id VARCHAR(100),
  description TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "IDX_user_exp_transactions_user" ON user_exp_transactions(user_id);
CREATE INDEX IF NOT EXISTS "IDX_user_exp_transactions_event" ON user_exp_transactions(event_type);
CREATE INDEX IF NOT EXISTS "IDX_user_exp_transactions_date" ON user_exp_transactions(created_at);

-- 成就定義表
CREATE TABLE IF NOT EXISTS achievements (
  id SERIAL PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  category VARCHAR(30) NOT NULL,
  name_zh VARCHAR(100) NOT NULL,
  name_en VARCHAR(100),
  description TEXT NOT NULL,
  description_en TEXT,
  rarity INTEGER NOT NULL DEFAULT 1,
  trigger_condition JSONB NOT NULL,
  exp_reward INTEGER NOT NULL DEFAULT 0,
  other_rewards JSONB,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "IDX_achievements_category" ON achievements(category);
CREATE INDEX IF NOT EXISTS "IDX_achievements_active" ON achievements(is_active);

-- 用戶成就表
CREATE TABLE IF NOT EXISTS user_achievements (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  achievement_id INTEGER NOT NULL REFERENCES achievements(id),
  unlocked_at TIMESTAMP NOT NULL DEFAULT NOW(),
  reward_claimed BOOLEAN NOT NULL DEFAULT false,
  claimed_at TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_user_achievements" ON user_achievements(user_id, achievement_id);
CREATE INDEX IF NOT EXISTS "IDX_user_achievements_user" ON user_achievements(user_id);

-- 用戶傾向追蹤表
CREATE TABLE IF NOT EXISTS user_tendencies (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  consumer_score INTEGER NOT NULL DEFAULT 0,
  investor_score INTEGER NOT NULL DEFAULT 0,
  promoter_score INTEGER NOT NULL DEFAULT 0,
  business_score INTEGER NOT NULL DEFAULT 0,
  specialist_score INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 用戶每日經驗統計
CREATE TABLE IF NOT EXISTS user_daily_exp_stats (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  date DATE NOT NULL,
  login_exp INTEGER NOT NULL DEFAULT 0,
  gacha_exp INTEGER NOT NULL DEFAULT 0,
  vote_exp INTEGER NOT NULL DEFAULT 0,
  share_exp INTEGER NOT NULL DEFAULT 0,
  total_exp INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_user_daily_exp_stats" ON user_daily_exp_stats(user_id, date);
CREATE INDEX IF NOT EXISTS "IDX_user_daily_exp_stats_date" ON user_daily_exp_stats(date);

-- 景點黑名單統計（全域）
CREATE TABLE IF NOT EXISTS place_dislike_stats (
  place_id INTEGER PRIMARY KEY REFERENCES places(id),
  monthly_dislike_count INTEGER NOT NULL DEFAULT 0,
  total_dislike_count INTEGER NOT NULL DEFAULT 0,
  last_reset_at TIMESTAMP NOT NULL DEFAULT NOW(),
  status VARCHAR(20) NOT NULL DEFAULT 'normal',
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "IDX_place_dislike_stats_status" ON place_dislike_stats(status);

-- 用戶景點黑名單（個人）
CREATE TABLE IF NOT EXISTS user_place_blacklists (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  place_id INTEGER NOT NULL REFERENCES places(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_user_place_blacklists" ON user_place_blacklists(user_id, place_id);
CREATE INDEX IF NOT EXISTS "IDX_user_place_blacklists_user" ON user_place_blacklists(user_id);

-- ============ Phase 2: 募資系統 ============

-- 募資活動表
CREATE TABLE IF NOT EXISTS crowdfund_campaigns (
  id SERIAL PRIMARY KEY,
  country_code VARCHAR(10) NOT NULL,
  country_name_zh VARCHAR(100) NOT NULL,
  country_name_en VARCHAR(100) NOT NULL,
  goal_amount INTEGER NOT NULL,
  current_amount INTEGER NOT NULL DEFAULT 0,
  contributor_count INTEGER NOT NULL DEFAULT 0,
  estimated_places INTEGER,
  status VARCHAR(20) NOT NULL DEFAULT 'upcoming',
  start_date TIMESTAMP NOT NULL,
  end_date TIMESTAMP,
  launched_at TIMESTAMP,
  description TEXT,
  description_en TEXT,
  image_url TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "IDX_crowdfund_campaigns_status" ON crowdfund_campaigns(status);
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_crowdfund_campaigns_country" ON crowdfund_campaigns(country_code);

-- 募資貢獻表
CREATE TABLE IF NOT EXISTS crowdfund_contributions (
  id SERIAL PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES crowdfund_campaigns(id),
  user_id TEXT REFERENCES users(id),
  email VARCHAR(255),
  display_name VARCHAR(100),
  amount INTEGER NOT NULL,
  payment_method VARCHAR(20) NOT NULL,
  transaction_id VARCHAR(255) UNIQUE,
  receipt_data TEXT,
  stripe_session_id VARCHAR(255),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  priority_access_used BOOLEAN NOT NULL DEFAULT false,
  priority_access_expires_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "IDX_crowdfund_contributions_campaign" ON crowdfund_contributions(campaign_id);
CREATE INDEX IF NOT EXISTS "IDX_crowdfund_contributions_user" ON crowdfund_contributions(user_id);
CREATE INDEX IF NOT EXISTS "IDX_crowdfund_contributions_status" ON crowdfund_contributions(status);

-- ============ Phase 3: 推薦系統 ============

-- 推薦碼
CREATE TABLE IF NOT EXISTS referral_codes (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id),
  code VARCHAR(20) NOT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "IDX_referral_codes_user" ON referral_codes(user_id);

-- 用戶推薦關係
CREATE TABLE IF NOT EXISTS user_referrals (
  id SERIAL PRIMARY KEY,
  referrer_id TEXT NOT NULL REFERENCES users(id),
  referee_id TEXT NOT NULL UNIQUE REFERENCES users(id),
  status VARCHAR(20) NOT NULL DEFAULT 'registered',
  registered_at TIMESTAMP NOT NULL DEFAULT NOW(),
  activated_at TIMESTAMP,
  referrer_reward_paid BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "IDX_user_referrals_referrer" ON user_referrals(referrer_id);
CREATE INDEX IF NOT EXISTS "IDX_user_referrals_referee" ON user_referrals(referee_id);

-- 商家推薦
CREATE TABLE IF NOT EXISTS merchant_referrals (
  id SERIAL PRIMARY KEY,
  referrer_id TEXT NOT NULL REFERENCES users(id),
  merchant_name VARCHAR(255) NOT NULL,
  address TEXT NOT NULL,
  city VARCHAR(100) NOT NULL,
  country VARCHAR(100) NOT NULL DEFAULT '台灣',
  category VARCHAR(50) NOT NULL,
  contact_info TEXT,
  google_place_id VARCHAR(100),
  notes TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at TIMESTAMP,
  rejection_reason TEXT,
  linked_merchant_id INTEGER REFERENCES merchants(id),
  linked_place_id INTEGER REFERENCES places(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "IDX_merchant_referrals_referrer" ON merchant_referrals(referrer_id);
CREATE INDEX IF NOT EXISTS "IDX_merchant_referrals_status" ON merchant_referrals(status);

-- 用戶餘額
CREATE TABLE IF NOT EXISTS user_balances (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  available_balance INTEGER NOT NULL DEFAULT 0,
  pending_balance INTEGER NOT NULL DEFAULT 0,
  lifetime_earned INTEGER NOT NULL DEFAULT 0,
  lifetime_withdrawn INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 餘額交易記錄
CREATE TABLE IF NOT EXISTS balance_transactions (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  amount INTEGER NOT NULL,
  type VARCHAR(30) NOT NULL,
  reference_type VARCHAR(30),
  reference_id INTEGER,
  description TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "IDX_balance_transactions_user" ON balance_transactions(user_id);
CREATE INDEX IF NOT EXISTS "IDX_balance_transactions_type" ON balance_transactions(type);

-- 提現申請
CREATE TABLE IF NOT EXISTS withdrawal_requests (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  amount INTEGER NOT NULL,
  fee INTEGER NOT NULL DEFAULT 0,
  net_amount INTEGER NOT NULL,
  bank_code VARCHAR(10) NOT NULL,
  bank_account VARCHAR(30) NOT NULL,
  account_name VARCHAR(100) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  processed_by TEXT REFERENCES users(id),
  processed_at TIMESTAMP,
  rejection_reason TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "IDX_withdrawal_requests_user" ON withdrawal_requests(user_id);
CREATE INDEX IF NOT EXISTS "IDX_withdrawal_requests_status" ON withdrawal_requests(status);

-- ============ Phase 4: 用戶貢獻系統 ============

-- 歇業回報
CREATE TABLE IF NOT EXISTS place_reports (
  id SERIAL PRIMARY KEY,
  place_id INTEGER NOT NULL REFERENCES places(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  reason VARCHAR(30) NOT NULL,
  description TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  ai_score DOUBLE PRECISION,
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at TIMESTAMP,
  rejection_reason TEXT,
  reward_paid BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "IDX_place_reports_place" ON place_reports(place_id);
CREATE INDEX IF NOT EXISTS "IDX_place_reports_user" ON place_reports(user_id);
CREATE INDEX IF NOT EXISTS "IDX_place_reports_status" ON place_reports(status);

-- 景點建議
CREATE TABLE IF NOT EXISTS place_suggestions (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  place_name VARCHAR(255) NOT NULL,
  address TEXT NOT NULL,
  city VARCHAR(100) NOT NULL,
  country VARCHAR(100) NOT NULL DEFAULT '台灣',
  category VARCHAR(50) NOT NULL,
  description TEXT,
  google_maps_url TEXT,
  google_place_id VARCHAR(100),
  status VARCHAR(20) NOT NULL DEFAULT 'pending_ai',
  ai_score DOUBLE PRECISION,
  vote_approve INTEGER NOT NULL DEFAULT 0,
  vote_reject INTEGER NOT NULL DEFAULT 0,
  vote_deadline TIMESTAMP,
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at TIMESTAMP,
  rejection_reason TEXT,
  linked_place_id INTEGER REFERENCES places(id),
  reward_paid BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "IDX_place_suggestions_user" ON place_suggestions(user_id);
CREATE INDEX IF NOT EXISTS "IDX_place_suggestions_status" ON place_suggestions(status);

-- 建議投票記錄
CREATE TABLE IF NOT EXISTS suggestion_votes (
  id SERIAL PRIMARY KEY,
  suggestion_id INTEGER NOT NULL REFERENCES place_suggestions(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  vote VARCHAR(10) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "IDX_suggestion_votes_suggestion" ON suggestion_votes(suggestion_id);
CREATE UNIQUE INDEX IF NOT EXISTS "IDX_suggestion_votes_unique" ON suggestion_votes(suggestion_id, user_id);

-- 排除投票記錄
CREATE TABLE IF NOT EXISTS place_exclusion_votes (
  id SERIAL PRIMARY KEY,
  place_id INTEGER NOT NULL REFERENCES places(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  vote VARCHAR(10) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "IDX_place_exclusion_votes_place" ON place_exclusion_votes(place_id);
CREATE UNIQUE INDEX IF NOT EXISTS "IDX_place_exclusion_votes_unique" ON place_exclusion_votes(place_id, user_id);

-- 用戶每日貢獻統計
CREATE TABLE IF NOT EXISTS user_daily_contributions (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  date DATE NOT NULL,
  report_count INTEGER NOT NULL DEFAULT 0,
  suggestion_count INTEGER NOT NULL DEFAULT 0,
  vote_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "IDX_user_daily_contributions_user" ON user_daily_contributions(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS "IDX_user_daily_contributions_unique" ON user_daily_contributions(user_id, date);

-- ============ Phase 5: 帳號系統 ============

-- 策劃師申請
CREATE TABLE IF NOT EXISTS specialist_applications (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  real_name VARCHAR(100) NOT NULL,
  regions JSONB NOT NULL,
  introduction TEXT NOT NULL,
  contact_info TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at TIMESTAMP,
  rejection_reason TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "IDX_specialist_applications_user" ON specialist_applications(user_id);
CREATE INDEX IF NOT EXISTS "IDX_specialist_applications_status" ON specialist_applications(status);

-- 訪客帳號遷移記錄
CREATE TABLE IF NOT EXISTS guest_migrations (
  id SERIAL PRIMARY KEY,
  guest_user_id TEXT NOT NULL,
  new_user_id TEXT NOT NULL REFERENCES users(id),
  migrated_collections INTEGER NOT NULL DEFAULT 0,
  migrated_inventory INTEGER NOT NULL DEFAULT 0,
  migrated_notifications INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "IDX_guest_migrations_guest" ON guest_migrations(guest_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS "IDX_guest_migrations_unique" ON guest_migrations(guest_user_id);

-- ============ Phase 6: 確保 opening_hours 欄位存在 ============

ALTER TABLE places ADD COLUMN IF NOT EXISTS opening_hours JSONB;

-- 完成！
SELECT 'Phase 1-6 Migration Complete' AS status;
