CREATE TABLE "achievements" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(50) NOT NULL,
	"category" varchar(30) NOT NULL,
	"name_zh" varchar(100) NOT NULL,
	"name_en" varchar(100),
	"description" text NOT NULL,
	"description_en" text,
	"rarity" integer DEFAULT 1 NOT NULL,
	"trigger_condition" jsonb NOT NULL,
	"exp_reward" integer DEFAULT 0 NOT NULL,
	"other_rewards" jsonb,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "achievements_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "ad_placements" (
	"id" serial PRIMARY KEY NOT NULL,
	"placement" varchar(50) NOT NULL,
	"platform" varchar(20) NOT NULL,
	"ad_unit_id" varchar(255),
	"ad_type" varchar(30) NOT NULL,
	"fallback_image_url" text,
	"fallback_link_url" text,
	"fallback_title" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"show_probability" integer DEFAULT 100 NOT NULL,
	"start_at" timestamp,
	"end_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" varchar(20) DEFAULT 'announcement' NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"image_url" text,
	"link_url" text,
	"start_date" timestamp DEFAULT now() NOT NULL,
	"end_date" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_identities" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"provider" varchar(20) NOT NULL,
	"provider_user_id" varchar(255) NOT NULL,
	"email" varchar,
	"email_verified" boolean DEFAULT false,
	"access_token" text,
	"refresh_token" text,
	"token_expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "balance_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"amount" integer NOT NULL,
	"type" varchar(30) NOT NULL,
	"reference_type" varchar(30),
	"reference_id" integer,
	"description" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collection_read_status" (
	"id" serial PRIMARY KEY NOT NULL,
	"collection_id" integer NOT NULL,
	"user_id" varchar NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"has_promo" boolean DEFAULT false NOT NULL,
	"last_promo_update" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coupon_probability_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"tier" varchar(10) NOT NULL,
	"probability" double precision NOT NULL,
	"updated_by" varchar,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "coupon_probability_settings_tier_unique" UNIQUE("tier")
);
--> statement-breakpoint
CREATE TABLE "coupon_rarity_configs" (
	"id" serial PRIMARY KEY NOT NULL,
	"config_key" varchar(50) DEFAULT 'global' NOT NULL,
	"sp_rate" integer DEFAULT 2 NOT NULL,
	"ssr_rate" integer DEFAULT 8 NOT NULL,
	"sr_rate" integer DEFAULT 15 NOT NULL,
	"s_rate" integer DEFAULT 23 NOT NULL,
	"r_rate" integer DEFAULT 32 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "coupon_rarity_configs_config_key_unique" UNIQUE("config_key")
);
--> statement-breakpoint
CREATE TABLE "coupon_redemptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"user_inventory_id" integer NOT NULL,
	"merchant_id" integer NOT NULL,
	"redemption_code" varchar(20) NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"verified_at" timestamp,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crowdfund_campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"country_code" varchar(10) NOT NULL,
	"country_name_zh" varchar(100) NOT NULL,
	"country_name_en" varchar(100) NOT NULL,
	"goal_amount" integer NOT NULL,
	"current_amount" integer DEFAULT 0 NOT NULL,
	"contributor_count" integer DEFAULT 0 NOT NULL,
	"estimated_places" integer,
	"status" varchar(20) DEFAULT 'upcoming' NOT NULL,
	"start_date" timestamp NOT NULL,
	"end_date" timestamp,
	"launched_at" timestamp,
	"description" text,
	"description_en" text,
	"image_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crowdfund_contributions" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"user_id" text,
	"email" varchar(255),
	"display_name" varchar(100),
	"amount" integer NOT NULL,
	"payment_method" varchar(20) NOT NULL,
	"transaction_id" varchar(255),
	"receipt_data" text,
	"stripe_session_id" varchar(255),
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"priority_access_used" boolean DEFAULT false NOT NULL,
	"priority_access_expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "crowdfund_contributions_transaction_id_unique" UNIQUE("transaction_id")
);
--> statement-breakpoint
CREATE TABLE "gacha_ai_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" varchar(36) NOT NULL,
	"user_id" varchar NOT NULL,
	"city" text NOT NULL,
	"district" text,
	"requested_count" integer NOT NULL,
	"ordered_place_ids" integer[],
	"rejected_place_ids" integer[],
	"ai_reason" text,
	"ai_model" text,
	"reorder_rounds" integer,
	"duration_ms" integer,
	"category_distribution" jsonb,
	"is_shortfall" boolean DEFAULT false,
	"trip_image_url" text,
	"is_published" boolean DEFAULT false,
	"published_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guest_migrations" (
	"id" serial PRIMARY KEY NOT NULL,
	"guest_user_id" text NOT NULL,
	"new_user_id" text NOT NULL,
	"migrated_collections" integer DEFAULT 0 NOT NULL,
	"migrated_inventory" integer DEFAULT 0 NOT NULL,
	"migrated_notifications" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "level_definitions" (
	"level" integer PRIMARY KEY NOT NULL,
	"required_exp" integer NOT NULL,
	"title" varchar(50) NOT NULL,
	"title_en" varchar(50),
	"is_milestone" boolean DEFAULT false NOT NULL,
	"is_unlocked" boolean DEFAULT true NOT NULL,
	"perks" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_analytics" (
	"id" serial PRIMARY KEY NOT NULL,
	"merchant_id" integer NOT NULL,
	"place_id" integer,
	"date" date NOT NULL,
	"collected_count" integer DEFAULT 0 NOT NULL,
	"total_collectors" integer DEFAULT 0 NOT NULL,
	"click_count" integer DEFAULT 0 NOT NULL,
	"coupon_usage_count" integer DEFAULT 0 NOT NULL,
	"coupon_issued_count" integer DEFAULT 0 NOT NULL,
	"prize_pool_views" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_coupons" (
	"id" serial PRIMARY KEY NOT NULL,
	"merchant_id" integer NOT NULL,
	"merchant_place_link_id" integer,
	"name" text NOT NULL,
	"tier" varchar(10) DEFAULT 'R' NOT NULL,
	"terms" text,
	"content" text NOT NULL,
	"quantity" integer DEFAULT -1 NOT NULL,
	"used_count" integer DEFAULT 0 NOT NULL,
	"valid_from" timestamp DEFAULT now() NOT NULL,
	"valid_until" timestamp,
	"background_image_url" text,
	"inventory_image_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_referrals" (
	"id" serial PRIMARY KEY NOT NULL,
	"referrer_id" text NOT NULL,
	"merchant_name" varchar(255) NOT NULL,
	"address" text NOT NULL,
	"city" varchar(100) NOT NULL,
	"country" varchar(100) DEFAULT '台灣' NOT NULL,
	"category" varchar(50) NOT NULL,
	"contact_info" text,
	"google_place_id" varchar(100),
	"notes" text,
	"status" varchar(30) DEFAULT 'pending' NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp,
	"rejection_reason" text,
	"linked_merchant_id" integer,
	"linked_place_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"merchant_id" integer NOT NULL,
	"type" varchar(20) NOT NULL,
	"tier" varchar(20) NOT NULL,
	"place_id" integer,
	"provider" varchar(20) NOT NULL,
	"provider_subscription_id" varchar(255) NOT NULL,
	"provider_customer_id" varchar(255),
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"current_period_start" timestamp,
	"current_period_end" timestamp,
	"scheduled_downgrade_to" varchar(20),
	"cancel_at_period_end" boolean DEFAULT false,
	"amount" integer,
	"currency" varchar(10) DEFAULT 'TWD',
	"last_payment_intent_id" varchar(255),
	"cancelled_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "place_dislike_stats" (
	"place_id" integer PRIMARY KEY NOT NULL,
	"monthly_dislike_count" integer DEFAULT 0 NOT NULL,
	"total_dislike_count" integer DEFAULT 0 NOT NULL,
	"last_reset_at" timestamp DEFAULT now() NOT NULL,
	"status" varchar(20) DEFAULT 'normal' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "place_exclusion_votes" (
	"id" serial PRIMARY KEY NOT NULL,
	"place_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"vote" varchar(10) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "place_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"place_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"reason" varchar(30) NOT NULL,
	"description" text,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"ai_score" double precision,
	"reviewed_by" text,
	"reviewed_at" timestamp,
	"rejection_reason" text,
	"reward_paid" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "place_suggestions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"place_name" varchar(255) NOT NULL,
	"address" text NOT NULL,
	"city" varchar(100) NOT NULL,
	"country" varchar(100) DEFAULT '台灣' NOT NULL,
	"category" varchar(50) NOT NULL,
	"description" text,
	"google_maps_url" text,
	"google_place_id" varchar(100),
	"status" varchar(20) DEFAULT 'pending_ai' NOT NULL,
	"ai_score" double precision,
	"vote_approve" integer DEFAULT 0 NOT NULL,
	"vote_reject" integer DEFAULT 0 NOT NULL,
	"vote_deadline" timestamp,
	"reviewed_by" text,
	"reviewed_at" timestamp,
	"rejection_reason" text,
	"linked_place_id" integer,
	"reward_paid" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "referral_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"code" varchar(20) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "referral_codes_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "referral_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "refund_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"subscription_id" integer NOT NULL,
	"merchant_id" integer NOT NULL,
	"reason" text NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"days_since_subscription" integer,
	"is_within_7_days" boolean DEFAULT false,
	"provider" varchar(20),
	"stripe_refund_id" varchar(255),
	"stripe_charge_id" varchar(255),
	"refund_amount" integer,
	"refund_currency" varchar(10) DEFAULT 'TWD',
	"processed_by" varchar(255),
	"processed_at" timestamp,
	"admin_notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sos_alerts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"service_order_id" integer,
	"planner_id" integer,
	"location" text,
	"location_address" text,
	"message" text,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"acknowledged_by" varchar,
	"acknowledged_at" timestamp,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "specialist_applications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"real_name" varchar(100) NOT NULL,
	"regions" jsonb NOT NULL,
	"introduction" text NOT NULL,
	"contact_info" text NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp,
	"rejection_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"tier" varchar(20) NOT NULL,
	"name" text NOT NULL,
	"name_en" text,
	"price_monthly" integer DEFAULT 0 NOT NULL,
	"price_yearly" integer,
	"price_period_label" text DEFAULT '/月',
	"features" text[] NOT NULL,
	"button_text" text NOT NULL,
	"highlighted" boolean DEFAULT false,
	"highlight_label" text,
	"stripe_monthly_price_id" varchar(255),
	"stripe_yearly_price_id" varchar(255),
	"recur_monthly_product_id" varchar(255),
	"recur_yearly_product_id" varchar(255),
	"max_places" integer DEFAULT 1 NOT NULL,
	"max_coupons" integer DEFAULT 5 NOT NULL,
	"has_advanced_analytics" boolean DEFAULT false,
	"has_priority_exposure" boolean DEFAULT false,
	"has_dedicated_support" boolean DEFAULT false,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_plans_tier_unique" UNIQUE("tier")
);
--> statement-breakpoint
CREATE TABLE "suggestion_votes" (
	"id" serial PRIMARY KEY NOT NULL,
	"suggestion_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"vote" varchar(10) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_configs" (
	"id" serial PRIMARY KEY NOT NULL,
	"category" varchar(50) NOT NULL,
	"key" varchar(100) NOT NULL,
	"value" jsonb NOT NULL,
	"value_type" varchar(20) NOT NULL,
	"default_value" jsonb,
	"label" text NOT NULL,
	"description" text,
	"ui_type" varchar(20),
	"ui_options" jsonb,
	"validation" jsonb,
	"editable_by" varchar(20) DEFAULT 'admin',
	"is_read_only" boolean DEFAULT false,
	"updated_at" timestamp DEFAULT now(),
	"updated_by" integer
);
--> statement-breakpoint
CREATE TABLE "trip_service_purchases" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"purchased_for_user_id" varchar,
	"country_id" integer NOT NULL,
	"region_id" integer NOT NULL,
	"arrival_date" timestamp NOT NULL,
	"departure_date" timestamp NOT NULL,
	"daily_price" integer DEFAULT 399 NOT NULL,
	"total_price" integer NOT NULL,
	"payment_status" varchar(20) DEFAULT 'pending' NOT NULL,
	"specialist_id" integer,
	"chat_room_id" text,
	"is_location_sharing_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_achievements" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"achievement_id" integer NOT NULL,
	"unlocked_at" timestamp DEFAULT now() NOT NULL,
	"reward_claimed" boolean DEFAULT false NOT NULL,
	"claimed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "user_balances" (
	"user_id" text PRIMARY KEY NOT NULL,
	"available_balance" integer DEFAULT 0 NOT NULL,
	"pending_balance" integer DEFAULT 0 NOT NULL,
	"lifetime_earned" integer DEFAULT 0 NOT NULL,
	"lifetime_withdrawn" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_daily_contributions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"date" date NOT NULL,
	"report_count" integer DEFAULT 0 NOT NULL,
	"suggestion_count" integer DEFAULT 0 NOT NULL,
	"vote_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_daily_exp_stats" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"date" date NOT NULL,
	"login_exp" integer DEFAULT 0 NOT NULL,
	"gacha_exp" integer DEFAULT 0 NOT NULL,
	"vote_exp" integer DEFAULT 0 NOT NULL,
	"share_exp" integer DEFAULT 0 NOT NULL,
	"total_exp" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_daily_gacha_stats" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"date" date NOT NULL,
	"pull_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_exp_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"amount" integer NOT NULL,
	"event_type" varchar(50) NOT NULL,
	"reference_type" varchar(50),
	"reference_id" varchar(100),
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_inventory" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"slot_index" integer NOT NULL,
	"item_type" varchar(20) DEFAULT 'coupon' NOT NULL,
	"merchant_coupon_id" integer,
	"item_name" text NOT NULL,
	"item_description" text,
	"image_url" text,
	"tier" varchar(10),
	"merchant_id" integer,
	"merchant_name" text,
	"terms" text,
	"content" text,
	"valid_until" timestamp,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"is_redeemed" boolean DEFAULT false NOT NULL,
	"redeemed_at" timestamp,
	"is_expired" boolean DEFAULT false NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_levels" (
	"user_id" text PRIMARY KEY NOT NULL,
	"current_exp" integer DEFAULT 0 NOT NULL,
	"current_level" integer DEFAULT 1 NOT NULL,
	"specialist_invited_at" timestamp,
	"specialist_applied_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"notification_type" varchar(30) NOT NULL,
	"unread_count" integer DEFAULT 0 NOT NULL,
	"last_seen_at" timestamp,
	"last_updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_place_blacklists" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"place_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_referrals" (
	"id" serial PRIMARY KEY NOT NULL,
	"referrer_id" text NOT NULL,
	"referee_id" text NOT NULL,
	"status" varchar(20) DEFAULT 'registered' NOT NULL,
	"registered_at" timestamp DEFAULT now() NOT NULL,
	"activated_at" timestamp,
	"referrer_reward_paid" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_referrals_referee_id_unique" UNIQUE("referee_id")
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"role" varchar(20) NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"applied_at" timestamp DEFAULT now() NOT NULL,
	"approved_at" timestamp,
	"approved_by" varchar,
	"rejected_at" timestamp,
	"rejected_by" varchar,
	"rejection_reason" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_tendencies" (
	"user_id" text PRIMARY KEY NOT NULL,
	"consumer_score" integer DEFAULT 0 NOT NULL,
	"investor_score" integer DEFAULT 0 NOT NULL,
	"promoter_score" integer DEFAULT 0 NOT NULL,
	"business_score" integer DEFAULT 0 NOT NULL,
	"specialist_score" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "withdrawal_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"amount" integer NOT NULL,
	"fee" integer DEFAULT 0 NOT NULL,
	"net_amount" integer NOT NULL,
	"bank_code" varchar(10) NOT NULL,
	"bank_account" varchar(30) NOT NULL,
	"account_name" varchar(100) NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"processed_by" text,
	"processed_at" timestamp,
	"rejection_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "merchants" ALTER COLUMN "name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "collections" ADD COLUMN "gacha_session_id" varchar(36);--> statement-breakpoint
ALTER TABLE "collections" ADD COLUMN "ai_reason" text;--> statement-breakpoint
ALTER TABLE "merchant_place_links" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "merchant_place_links" ADD COLUMN "category_id" integer;--> statement-breakpoint
ALTER TABLE "merchant_place_links" ADD COLUMN "google_map_url" text;--> statement-breakpoint
ALTER TABLE "merchant_place_links" ADD COLUMN "opening_hours" jsonb;--> statement-breakpoint
ALTER TABLE "merchant_place_links" ADD COLUMN "rejection_reason" text;--> statement-breakpoint
ALTER TABLE "merchant_place_links" ADD COLUMN "submitted_at" timestamp;--> statement-breakpoint
ALTER TABLE "merchant_place_links" ADD COLUMN "approved_at" timestamp;--> statement-breakpoint
ALTER TABLE "merchant_place_links" ADD COLUMN "card_level" varchar(20) DEFAULT 'free' NOT NULL;--> statement-breakpoint
ALTER TABLE "merchant_place_links" ADD COLUMN "card_frame_enabled" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "merchant_place_links" ADD COLUMN "special_effect_enabled" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "merchant_place_links" ADD COLUMN "inventory_image_url" text;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "owner_name" text;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "business_name" text;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "tax_id" varchar(20);--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "business_category" varchar(50);--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "phone" varchar(20);--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "mobile" varchar(20);--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "status" varchar(20) DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "merchant_level" varchar(20) DEFAULT 'free' NOT NULL;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "merchant_level_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "stripe_customer_id" varchar(255);--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "recur_customer_id" varchar(255);--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "rejection_reason" text;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "approved_at" timestamp;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "place_cache" ADD COLUMN "place_name_i18n" jsonb;--> statement-breakpoint
ALTER TABLE "place_cache" ADD COLUMN "description_i18n" jsonb;--> statement-breakpoint
ALTER TABLE "place_cache" ADD COLUMN "ai_reviewed" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "place_cache" ADD COLUMN "ai_reviewed_at" timestamp;--> statement-breakpoint
ALTER TABLE "place_drafts" ADD COLUMN "place_name_i18n" jsonb;--> statement-breakpoint
ALTER TABLE "place_drafts" ADD COLUMN "description_i18n" jsonb;--> statement-breakpoint
ALTER TABLE "place_drafts" ADD COLUMN "google_review_count" integer;--> statement-breakpoint
ALTER TABLE "place_drafts" ADD COLUMN "opening_hours" jsonb;--> statement-breakpoint
ALTER TABLE "place_drafts" ADD COLUMN "phone" varchar(50);--> statement-breakpoint
ALTER TABLE "place_drafts" ADD COLUMN "website" text;--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "place_name_i18n" jsonb;--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "address_i18n" jsonb;--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "google_types" text;--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "primary_type" text;--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "description_i18n" jsonb;--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "opening_hours" jsonb;--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "promo_title" text;--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "promo_description" text;--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "claim_status" varchar(20) DEFAULT 'unclaimed';--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "place_card_tier" varchar(20) DEFAULT 'free';--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "place_card_tier_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "business_status" varchar(50);--> statement-breakpoint
ALTER TABLE "places" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "gender" varchar(10);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "birth_date" date;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone" varchar(20);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "dietary_restrictions" text[];--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "medical_history" text[];--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "emergency_contact_name" varchar(100);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "emergency_contact_phone" varchar(20);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "emergency_contact_relation" varchar(50);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "preferred_language" varchar(10) DEFAULT 'zh-TW';--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_identities" ADD CONSTRAINT "auth_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "balance_transactions" ADD CONSTRAINT "balance_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_read_status" ADD CONSTRAINT "collection_read_status_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_read_status" ADD CONSTRAINT "collection_read_status_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_probability_settings" ADD CONSTRAINT "coupon_probability_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_user_inventory_id_user_inventory_id_fk" FOREIGN KEY ("user_inventory_id") REFERENCES "public"."user_inventory"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crowdfund_contributions" ADD CONSTRAINT "crowdfund_contributions_campaign_id_crowdfund_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."crowdfund_campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crowdfund_contributions" ADD CONSTRAINT "crowdfund_contributions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gacha_ai_logs" ADD CONSTRAINT "gacha_ai_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_migrations" ADD CONSTRAINT "guest_migrations_new_user_id_users_id_fk" FOREIGN KEY ("new_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_analytics" ADD CONSTRAINT "merchant_analytics_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_analytics" ADD CONSTRAINT "merchant_analytics_place_id_merchant_place_links_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."merchant_place_links"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_coupons" ADD CONSTRAINT "merchant_coupons_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_coupons" ADD CONSTRAINT "merchant_coupons_merchant_place_link_id_merchant_place_links_id_fk" FOREIGN KEY ("merchant_place_link_id") REFERENCES "public"."merchant_place_links"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_referrals" ADD CONSTRAINT "merchant_referrals_referrer_id_users_id_fk" FOREIGN KEY ("referrer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_referrals" ADD CONSTRAINT "merchant_referrals_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_referrals" ADD CONSTRAINT "merchant_referrals_linked_merchant_id_merchants_id_fk" FOREIGN KEY ("linked_merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_referrals" ADD CONSTRAINT "merchant_referrals_linked_place_id_places_id_fk" FOREIGN KEY ("linked_place_id") REFERENCES "public"."places"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_subscriptions" ADD CONSTRAINT "merchant_subscriptions_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_subscriptions" ADD CONSTRAINT "merchant_subscriptions_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_dislike_stats" ADD CONSTRAINT "place_dislike_stats_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_exclusion_votes" ADD CONSTRAINT "place_exclusion_votes_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_exclusion_votes" ADD CONSTRAINT "place_exclusion_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_reports" ADD CONSTRAINT "place_reports_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_reports" ADD CONSTRAINT "place_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_reports" ADD CONSTRAINT "place_reports_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_suggestions" ADD CONSTRAINT "place_suggestions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_suggestions" ADD CONSTRAINT "place_suggestions_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_suggestions" ADD CONSTRAINT "place_suggestions_linked_place_id_places_id_fk" FOREIGN KEY ("linked_place_id") REFERENCES "public"."places"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_codes" ADD CONSTRAINT "referral_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_subscription_id_merchant_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."merchant_subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sos_alerts" ADD CONSTRAINT "sos_alerts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "specialist_applications" ADD CONSTRAINT "specialist_applications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "specialist_applications" ADD CONSTRAINT "specialist_applications_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestion_votes" ADD CONSTRAINT "suggestion_votes_suggestion_id_place_suggestions_id_fk" FOREIGN KEY ("suggestion_id") REFERENCES "public"."place_suggestions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestion_votes" ADD CONSTRAINT "suggestion_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_service_purchases" ADD CONSTRAINT "trip_service_purchases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_service_purchases" ADD CONSTRAINT "trip_service_purchases_purchased_for_user_id_users_id_fk" FOREIGN KEY ("purchased_for_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_service_purchases" ADD CONSTRAINT "trip_service_purchases_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_service_purchases" ADD CONSTRAINT "trip_service_purchases_region_id_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_service_purchases" ADD CONSTRAINT "trip_service_purchases_specialist_id_specialists_id_fk" FOREIGN KEY ("specialist_id") REFERENCES "public"."specialists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_achievement_id_achievements_id_fk" FOREIGN KEY ("achievement_id") REFERENCES "public"."achievements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_balances" ADD CONSTRAINT "user_balances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_daily_contributions" ADD CONSTRAINT "user_daily_contributions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_daily_exp_stats" ADD CONSTRAINT "user_daily_exp_stats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_daily_gacha_stats" ADD CONSTRAINT "user_daily_gacha_stats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_exp_transactions" ADD CONSTRAINT "user_exp_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_inventory" ADD CONSTRAINT "user_inventory_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_inventory" ADD CONSTRAINT "user_inventory_merchant_coupon_id_merchant_coupons_id_fk" FOREIGN KEY ("merchant_coupon_id") REFERENCES "public"."merchant_coupons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_inventory" ADD CONSTRAINT "user_inventory_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_levels" ADD CONSTRAINT "user_levels_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_notifications" ADD CONSTRAINT "user_notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_place_blacklists" ADD CONSTRAINT "user_place_blacklists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_place_blacklists" ADD CONSTRAINT "user_place_blacklists_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_referrals" ADD CONSTRAINT "user_referrals_referrer_id_users_id_fk" FOREIGN KEY ("referrer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_referrals" ADD CONSTRAINT "user_referrals_referee_id_users_id_fk" FOREIGN KEY ("referee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_rejected_by_users_id_fk" FOREIGN KEY ("rejected_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_tendencies" ADD CONSTRAINT "user_tendencies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "withdrawal_requests" ADD CONSTRAINT "withdrawal_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "withdrawal_requests" ADD CONSTRAINT "withdrawal_requests_processed_by_users_id_fk" FOREIGN KEY ("processed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "IDX_achievements_category" ON "achievements" USING btree ("category");--> statement-breakpoint
CREATE INDEX "IDX_achievements_active" ON "achievements" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "IDX_ad_placements_placement" ON "ad_placements" USING btree ("placement");--> statement-breakpoint
CREATE INDEX "IDX_ad_placements_platform" ON "ad_placements" USING btree ("platform");--> statement-breakpoint
CREATE UNIQUE INDEX "UQ_ad_placements_placement_platform" ON "ad_placements" USING btree ("placement","platform");--> statement-breakpoint
CREATE INDEX "IDX_announcements_type" ON "announcements" USING btree ("type");--> statement-breakpoint
CREATE INDEX "IDX_announcements_dates" ON "announcements" USING btree ("start_date","end_date");--> statement-breakpoint
CREATE INDEX "IDX_announcements_active" ON "announcements" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "IDX_auth_identities_user" ON "auth_identities" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "IDX_auth_identities_email" ON "auth_identities" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "UQ_auth_identities_provider_user" ON "auth_identities" USING btree ("provider","provider_user_id");--> statement-breakpoint
CREATE INDEX "IDX_balance_transactions_user" ON "balance_transactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "IDX_balance_transactions_type" ON "balance_transactions" USING btree ("type");--> statement-breakpoint
CREATE INDEX "IDX_collection_read_user" ON "collection_read_status" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "IDX_collection_read_status" ON "collection_read_status" USING btree ("is_read");--> statement-breakpoint
CREATE INDEX "IDX_coupon_redemptions_user" ON "coupon_redemptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "IDX_coupon_redemptions_status" ON "coupon_redemptions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "IDX_coupon_redemptions_expires" ON "coupon_redemptions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "IDX_crowdfund_campaigns_status" ON "crowdfund_campaigns" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "UQ_crowdfund_campaigns_country" ON "crowdfund_campaigns" USING btree ("country_code");--> statement-breakpoint
CREATE INDEX "IDX_crowdfund_contributions_campaign" ON "crowdfund_contributions" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "IDX_crowdfund_contributions_user" ON "crowdfund_contributions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "IDX_crowdfund_contributions_status" ON "crowdfund_contributions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "IDX_gacha_ai_logs_user" ON "gacha_ai_logs" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_gacha_ai_logs_session_unique" ON "gacha_ai_logs" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "IDX_gacha_ai_logs_created" ON "gacha_ai_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "IDX_gacha_ai_logs_published" ON "gacha_ai_logs" USING btree ("is_published");--> statement-breakpoint
CREATE INDEX "IDX_guest_migrations_guest" ON "guest_migrations" USING btree ("guest_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_guest_migrations_unique" ON "guest_migrations" USING btree ("guest_user_id");--> statement-breakpoint
CREATE INDEX "IDX_merchant_analytics_merchant" ON "merchant_analytics" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "IDX_merchant_analytics_place" ON "merchant_analytics" USING btree ("place_id");--> statement-breakpoint
CREATE INDEX "IDX_merchant_analytics_date" ON "merchant_analytics" USING btree ("date");--> statement-breakpoint
CREATE INDEX "IDX_merchant_coupons_merchant" ON "merchant_coupons" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "IDX_merchant_coupons_tier" ON "merchant_coupons" USING btree ("tier");--> statement-breakpoint
CREATE INDEX "IDX_merchant_coupons_active" ON "merchant_coupons" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "IDX_merchant_referrals_referrer" ON "merchant_referrals" USING btree ("referrer_id");--> statement-breakpoint
CREATE INDEX "IDX_merchant_referrals_status" ON "merchant_referrals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "IDX_merchant_subscriptions_merchant" ON "merchant_subscriptions" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "IDX_merchant_subscriptions_status" ON "merchant_subscriptions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "IDX_merchant_subscriptions_provider" ON "merchant_subscriptions" USING btree ("provider","provider_subscription_id");--> statement-breakpoint
CREATE INDEX "IDX_place_dislike_stats_status" ON "place_dislike_stats" USING btree ("status");--> statement-breakpoint
CREATE INDEX "IDX_place_exclusion_votes_place" ON "place_exclusion_votes" USING btree ("place_id");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_place_exclusion_votes_unique" ON "place_exclusion_votes" USING btree ("place_id","user_id");--> statement-breakpoint
CREATE INDEX "IDX_place_reports_place" ON "place_reports" USING btree ("place_id");--> statement-breakpoint
CREATE INDEX "IDX_place_reports_user" ON "place_reports" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "IDX_place_reports_status" ON "place_reports" USING btree ("status");--> statement-breakpoint
CREATE INDEX "IDX_place_suggestions_user" ON "place_suggestions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "IDX_place_suggestions_status" ON "place_suggestions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "IDX_referral_codes_user" ON "referral_codes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "IDX_refund_requests_subscription" ON "refund_requests" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "IDX_refund_requests_merchant" ON "refund_requests" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "IDX_refund_requests_status" ON "refund_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "IDX_refund_requests_created" ON "refund_requests" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "IDX_sos_alerts_user" ON "sos_alerts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "IDX_sos_alerts_planner" ON "sos_alerts" USING btree ("planner_id");--> statement-breakpoint
CREATE INDEX "IDX_sos_alerts_status" ON "sos_alerts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "IDX_specialist_applications_user" ON "specialist_applications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "IDX_specialist_applications_status" ON "specialist_applications" USING btree ("status");--> statement-breakpoint
CREATE INDEX "IDX_suggestion_votes_suggestion" ON "suggestion_votes" USING btree ("suggestion_id");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_suggestion_votes_unique" ON "suggestion_votes" USING btree ("suggestion_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "UQ_system_configs_category_key" ON "system_configs" USING btree ("category","key");--> statement-breakpoint
CREATE INDEX "IDX_trip_service_user" ON "trip_service_purchases" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "IDX_trip_service_specialist" ON "trip_service_purchases" USING btree ("specialist_id");--> statement-breakpoint
CREATE INDEX "IDX_trip_service_dates" ON "trip_service_purchases" USING btree ("arrival_date","departure_date");--> statement-breakpoint
CREATE INDEX "IDX_trip_service_status" ON "trip_service_purchases" USING btree ("payment_status");--> statement-breakpoint
CREATE UNIQUE INDEX "UQ_user_achievements" ON "user_achievements" USING btree ("user_id","achievement_id");--> statement-breakpoint
CREATE INDEX "IDX_user_achievements_user" ON "user_achievements" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "IDX_user_daily_contributions_user" ON "user_daily_contributions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_user_daily_contributions_unique" ON "user_daily_contributions" USING btree ("user_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "UQ_user_daily_exp_stats" ON "user_daily_exp_stats" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "IDX_user_daily_exp_stats_date" ON "user_daily_exp_stats" USING btree ("date");--> statement-breakpoint
CREATE INDEX "IDX_user_daily_gacha_user" ON "user_daily_gacha_stats" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "IDX_user_daily_gacha_date" ON "user_daily_gacha_stats" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "UQ_user_daily_gacha_user_date" ON "user_daily_gacha_stats" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "IDX_user_exp_transactions_user" ON "user_exp_transactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "IDX_user_exp_transactions_event" ON "user_exp_transactions" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "IDX_user_exp_transactions_date" ON "user_exp_transactions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "IDX_user_inventory_user" ON "user_inventory" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "IDX_user_inventory_type" ON "user_inventory" USING btree ("item_type");--> statement-breakpoint
CREATE INDEX "IDX_user_inventory_read" ON "user_inventory" USING btree ("is_read");--> statement-breakpoint
CREATE INDEX "IDX_user_inventory_slot" ON "user_inventory" USING btree ("user_id","slot_index");--> statement-breakpoint
CREATE INDEX "IDX_user_inventory_status" ON "user_inventory" USING btree ("status");--> statement-breakpoint
CREATE INDEX "IDX_user_levels_level" ON "user_levels" USING btree ("current_level");--> statement-breakpoint
CREATE INDEX "IDX_user_notifications_user" ON "user_notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "IDX_user_notifications_type" ON "user_notifications" USING btree ("notification_type");--> statement-breakpoint
CREATE UNIQUE INDEX "UQ_user_place_blacklists" ON "user_place_blacklists" USING btree ("user_id","place_id");--> statement-breakpoint
CREATE INDEX "IDX_user_place_blacklists_user" ON "user_place_blacklists" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "IDX_user_referrals_referrer" ON "user_referrals" USING btree ("referrer_id");--> statement-breakpoint
CREATE INDEX "IDX_user_referrals_referee" ON "user_referrals" USING btree ("referee_id");--> statement-breakpoint
CREATE INDEX "IDX_user_roles_user" ON "user_roles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "IDX_user_roles_role" ON "user_roles" USING btree ("role");--> statement-breakpoint
CREATE INDEX "IDX_user_roles_status" ON "user_roles" USING btree ("status");--> statement-breakpoint
CREATE INDEX "IDX_withdrawal_requests_user" ON "withdrawal_requests" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "IDX_withdrawal_requests_status" ON "withdrawal_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "IDX_cart_items_product" ON "cart_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "IDX_collections_gacha_session" ON "collections" USING btree ("gacha_session_id");--> statement-breakpoint
CREATE INDEX "IDX_collections_user_time" ON "collections" USING btree ("user_id","collected_at");--> statement-breakpoint
CREATE INDEX "IDX_commerce_orders_status" ON "commerce_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "IDX_coupons_merchant" ON "coupons" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "IDX_coupons_active" ON "coupons" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "IDX_coupons_merchant_active" ON "coupons" USING btree ("merchant_id","is_active");--> statement-breakpoint
CREATE INDEX "IDX_coupons_created" ON "coupons" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "IDX_merchant_place_links_status" ON "merchant_place_links" USING btree ("status");--> statement-breakpoint
CREATE INDEX "IDX_merchants_user" ON "merchants" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "IDX_merchants_status" ON "merchants" USING btree ("status");--> statement-breakpoint
CREATE INDEX "IDX_merchants_created" ON "merchants" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "IDX_merchants_stripe_customer" ON "merchants" USING btree ("stripe_customer_id");--> statement-breakpoint
CREATE INDEX "IDX_merchants_recur_customer" ON "merchants" USING btree ("recur_customer_id");--> statement-breakpoint
CREATE INDEX "IDX_place_cache_ai_reviewed" ON "place_cache" USING btree ("ai_reviewed");--> statement-breakpoint
CREATE INDEX "IDX_places_city_district_active" ON "places" USING btree ("city","district","is_active");--> statement-breakpoint
CREATE INDEX "IDX_places_is_active" ON "places" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "IDX_places_claim_status" ON "places" USING btree ("claim_status");--> statement-breakpoint
CREATE INDEX "IDX_service_relations_status" ON "service_relations" USING btree ("status");