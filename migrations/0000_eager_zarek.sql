CREATE TABLE "cart_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"product_id" integer NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"added_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(50) NOT NULL,
	"name_en" text NOT NULL,
	"name_zh" text NOT NULL,
	"name_ja" text,
	"name_ko" text,
	"color_hex" varchar(7) DEFAULT '#6366f1',
	"sort_order" integer DEFAULT 0,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "categories_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "chat_invites" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_sid" varchar(100) NOT NULL,
	"inviter_user_id" varchar NOT NULL,
	"invite_code" varchar(50) NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"used_by_user_id" varchar,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "chat_invites_invite_code_unique" UNIQUE("invite_code")
);
--> statement-breakpoint
CREATE TABLE "collections" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"official_place_id" integer,
	"place_name" text NOT NULL,
	"country" text NOT NULL,
	"city" text NOT NULL,
	"district" text,
	"category" text,
	"subcategory" text,
	"description" text,
	"address" text,
	"place_id" text,
	"rating" text,
	"location_lat" text,
	"location_lng" text,
	"google_types" text,
	"is_coupon" boolean DEFAULT false,
	"coupon_data" jsonb,
	"won_coupon_id" integer,
	"collected_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commerce_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"stripe_session_id" varchar(200),
	"stripe_payment_intent_id" varchar(200),
	"status" varchar(30) DEFAULT 'pending' NOT NULL,
	"total_amount" integer NOT NULL,
	"currency" varchar(10) DEFAULT 'TWD' NOT NULL,
	"items" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companion_invites" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"inviter_user_id" varchar NOT NULL,
	"invitee_email" varchar(255),
	"invitee_user_id" varchar,
	"invite_code" varchar(50) NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "companion_invites_invite_code_unique" UNIQUE("invite_code")
);
--> statement-breakpoint
CREATE TABLE "countries" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(10) NOT NULL,
	"name_en" text NOT NULL,
	"name_zh" text NOT NULL,
	"name_ja" text,
	"name_ko" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "countries_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "coupons" (
	"id" serial PRIMARY KEY NOT NULL,
	"merchant_id" integer NOT NULL,
	"merchant_place_link_id" integer,
	"place_id" integer,
	"place_name" text NOT NULL,
	"title" text NOT NULL,
	"code" text NOT NULL,
	"terms" text,
	"rarity" varchar(10),
	"drop_rate" double precision,
	"remaining_quantity" integer DEFAULT 0 NOT NULL,
	"redeemed_count" integer DEFAULT 0 NOT NULL,
	"impression_count" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "districts" (
	"id" serial PRIMARY KEY NOT NULL,
	"region_id" integer NOT NULL,
	"code" varchar(50) NOT NULL,
	"name_en" text NOT NULL,
	"name_zh" text NOT NULL,
	"name_ja" text,
	"name_ko" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "klook_products" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"name_normalized" text NOT NULL,
	"klook_url" text NOT NULL,
	"category" text,
	"region" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_place_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"merchant_id" integer NOT NULL,
	"official_place_id" integer,
	"place_cache_id" integer,
	"google_place_id" text,
	"place_name" text NOT NULL,
	"district" text NOT NULL,
	"city" text NOT NULL,
	"country" text NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"coupon_drop_rate" double precision DEFAULT 0.1,
	"promo_title" text,
	"promo_description" text,
	"promo_image_url" text,
	"is_promo_active" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "merchant_place_links_official_place_id_unique" UNIQUE("official_place_id")
);
--> statement-breakpoint
CREATE TABLE "merchants" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"subscription_plan" text DEFAULT 'free' NOT NULL,
	"daily_seed_code" text,
	"code_updated_at" timestamp,
	"credit_balance" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_highlights" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_sid" varchar(100) NOT NULL,
	"message_sid" varchar(100) NOT NULL,
	"product_name" text NOT NULL,
	"product_url" text NOT NULL,
	"start_index" integer NOT NULL,
	"end_index" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "place_applications" (
	"id" serial PRIMARY KEY NOT NULL,
	"merchant_id" integer NOT NULL,
	"place_draft_id" integer NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"reviewed_by" varchar,
	"reviewed_at" timestamp,
	"review_notes" text,
	"place_cache_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "place_cache" (
	"id" serial PRIMARY KEY NOT NULL,
	"sub_category" text NOT NULL,
	"district" text NOT NULL,
	"city" text NOT NULL,
	"country" text NOT NULL,
	"place_name" text NOT NULL,
	"description" text NOT NULL,
	"category" text NOT NULL,
	"suggested_time" text,
	"duration" text,
	"search_query" text,
	"rarity" text,
	"color_hex" text,
	"place_id" text,
	"verified_name" text,
	"verified_address" text,
	"google_rating" text,
	"google_types" text,
	"primary_type" text,
	"location_lat" text,
	"location_lng" text,
	"is_location_verified" boolean DEFAULT false,
	"business_status" varchar(50),
	"last_verified_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "place_drafts" (
	"id" serial PRIMARY KEY NOT NULL,
	"merchant_id" integer,
	"source" varchar(20) DEFAULT 'merchant' NOT NULL,
	"place_name" text NOT NULL,
	"category_id" integer NOT NULL,
	"subcategory_id" integer NOT NULL,
	"description" text,
	"district_id" integer NOT NULL,
	"region_id" integer NOT NULL,
	"country_id" integer NOT NULL,
	"address" text,
	"google_place_id" text,
	"google_rating" double precision,
	"location_lat" text,
	"location_lng" text,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"approved_place_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "place_feedback" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar(255),
	"place_cache_id" integer,
	"place_name" text NOT NULL,
	"district" text NOT NULL,
	"city" text NOT NULL,
	"penalty_score" integer DEFAULT 1 NOT NULL,
	"last_interacted_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "place_products" (
	"id" serial PRIMARY KEY NOT NULL,
	"place_cache_id" integer,
	"merchant_id" integer,
	"name" varchar(200) NOT NULL,
	"description" text,
	"price" integer NOT NULL,
	"currency" varchar(10) DEFAULT 'TWD' NOT NULL,
	"category" varchar(50),
	"image_url" text,
	"stripe_product_id" varchar(100),
	"stripe_price_id" varchar(100),
	"is_active" boolean DEFAULT true NOT NULL,
	"stock" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "places" (
	"id" serial PRIMARY KEY NOT NULL,
	"place_name" text NOT NULL,
	"country" text NOT NULL,
	"city" text NOT NULL,
	"district" text NOT NULL,
	"address" text,
	"location_lat" double precision,
	"location_lng" double precision,
	"google_place_id" text,
	"rating" double precision,
	"photo_reference" text,
	"category" text NOT NULL,
	"subcategory" text,
	"description" text,
	"merchant_id" integer,
	"is_promo_active" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "places_google_place_id_unique" UNIQUE("google_place_id")
);
--> statement-breakpoint
CREATE TABLE "planners" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"display_name" text NOT NULL,
	"bio" text,
	"profile_image_url" text,
	"specialties" text[],
	"languages" text[],
	"rating" integer DEFAULT 0,
	"total_orders" integer DEFAULT 0,
	"is_available" boolean DEFAULT true NOT NULL,
	"is_verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "regions" (
	"id" serial PRIMARY KEY NOT NULL,
	"country_id" integer NOT NULL,
	"code" varchar(50) NOT NULL,
	"name_en" text NOT NULL,
	"name_zh" text NOT NULL,
	"name_ja" text,
	"name_ko" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_number" varchar(50) NOT NULL,
	"user_id" varchar NOT NULL,
	"service_plan_id" integer NOT NULL,
	"planner_id" integer,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"payment_method" varchar(20),
	"payment_id" varchar(100),
	"amount_paid" integer,
	"currency" varchar(10) DEFAULT 'TWD',
	"conversation_sid" varchar(50),
	"notes" text,
	"paid_at" timestamp,
	"assigned_at" timestamp,
	"completed_at" timestamp,
	"expires_at" timestamp,
	"verification_code" varchar(8),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "service_orders_order_number_unique" UNIQUE("order_number")
);
--> statement-breakpoint
CREATE TABLE "service_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(50) NOT NULL,
	"name_zh" text NOT NULL,
	"name_en" text NOT NULL,
	"description" text,
	"features" text[],
	"price_ntd" integer NOT NULL,
	"price_usd" integer,
	"duration_days" integer DEFAULT 7,
	"max_messages" integer,
	"sort_order" integer DEFAULT 0,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "service_plans_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "service_relations" (
	"id" serial PRIMARY KEY NOT NULL,
	"specialist_id" integer NOT NULL,
	"traveler_id" varchar NOT NULL,
	"twilio_channel_sid" text,
	"region" text NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"ended_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sos_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"location_lat" text,
	"location_lng" text,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"resolved_by" varchar,
	"resolved_at" timestamp,
	"audio_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "specialists" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"name" text NOT NULL,
	"service_region" text NOT NULL,
	"is_available" boolean DEFAULT true NOT NULL,
	"max_travelers" integer DEFAULT 5 NOT NULL,
	"current_travelers" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subcategories" (
	"id" serial PRIMARY KEY NOT NULL,
	"category_id" integer NOT NULL,
	"code" varchar(100) NOT NULL,
	"name_en" text NOT NULL,
	"name_zh" text NOT NULL,
	"name_ja" text,
	"name_ko" text,
	"search_keywords" text,
	"preferred_time_slot" varchar(20) DEFAULT 'anytime',
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"merchant_id" integer NOT NULL,
	"amount" integer NOT NULL,
	"price" integer,
	"provider" varchar(20),
	"payment_status" varchar(20) DEFAULT 'pending' NOT NULL,
	"payment_method" varchar(50),
	"external_order_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"paid_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "travel_companions" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"user_id" varchar NOT NULL,
	"role" varchar(20) DEFAULT 'companion' NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trip_activities" (
	"id" serial PRIMARY KEY NOT NULL,
	"trip_day_id" integer NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"time_slot" varchar(20) DEFAULT 'morning' NOT NULL,
	"place_name" text NOT NULL,
	"place_id" text,
	"category" text,
	"subcategory" text,
	"description" text,
	"address" text,
	"location_lat" text,
	"location_lng" text,
	"duration" integer,
	"notes" text,
	"is_from_gacha" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trip_days" (
	"id" serial PRIMARY KEY NOT NULL,
	"trip_plan_id" integer NOT NULL,
	"day_number" integer NOT NULL,
	"date" text NOT NULL,
	"title" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trip_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"title" text NOT NULL,
	"destination" text NOT NULL,
	"destination_district" text,
	"destination_city" text,
	"destination_country" text,
	"start_date" text NOT NULL,
	"end_date" text NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"cover_image_url" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_locations" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"lat" double precision NOT NULL,
	"lon" double precision NOT NULL,
	"is_sharing_enabled" boolean DEFAULT true NOT NULL,
	"sos_mode" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_locations_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar,
	"password" text,
	"first_name" varchar,
	"last_name" varchar,
	"profile_image_url" varchar,
	"role" varchar(20) DEFAULT 'traveler' NOT NULL,
	"provider" varchar(20),
	"is_approved" boolean DEFAULT false NOT NULL,
	"stripe_customer_id" varchar,
	"sos_secret_key" varchar(64),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_product_id_place_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."place_products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_invites" ADD CONSTRAINT "chat_invites_inviter_user_id_users_id_fk" FOREIGN KEY ("inviter_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_invites" ADD CONSTRAINT "chat_invites_used_by_user_id_users_id_fk" FOREIGN KEY ("used_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collections" ADD CONSTRAINT "collections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collections" ADD CONSTRAINT "collections_official_place_id_places_id_fk" FOREIGN KEY ("official_place_id") REFERENCES "public"."places"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collections" ADD CONSTRAINT "collections_won_coupon_id_coupons_id_fk" FOREIGN KEY ("won_coupon_id") REFERENCES "public"."coupons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_orders" ADD CONSTRAINT "commerce_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companion_invites" ADD CONSTRAINT "companion_invites_order_id_service_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."service_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companion_invites" ADD CONSTRAINT "companion_invites_inviter_user_id_users_id_fk" FOREIGN KEY ("inviter_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companion_invites" ADD CONSTRAINT "companion_invites_invitee_user_id_users_id_fk" FOREIGN KEY ("invitee_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_merchant_place_link_id_merchant_place_links_id_fk" FOREIGN KEY ("merchant_place_link_id") REFERENCES "public"."merchant_place_links"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "districts" ADD CONSTRAINT "districts_region_id_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_place_links" ADD CONSTRAINT "merchant_place_links_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_place_links" ADD CONSTRAINT "merchant_place_links_official_place_id_places_id_fk" FOREIGN KEY ("official_place_id") REFERENCES "public"."places"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_place_links" ADD CONSTRAINT "merchant_place_links_place_cache_id_place_cache_id_fk" FOREIGN KEY ("place_cache_id") REFERENCES "public"."place_cache"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_applications" ADD CONSTRAINT "place_applications_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_applications" ADD CONSTRAINT "place_applications_place_draft_id_place_drafts_id_fk" FOREIGN KEY ("place_draft_id") REFERENCES "public"."place_drafts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_applications" ADD CONSTRAINT "place_applications_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_applications" ADD CONSTRAINT "place_applications_place_cache_id_place_cache_id_fk" FOREIGN KEY ("place_cache_id") REFERENCES "public"."place_cache"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_drafts" ADD CONSTRAINT "place_drafts_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_drafts" ADD CONSTRAINT "place_drafts_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_drafts" ADD CONSTRAINT "place_drafts_subcategory_id_subcategories_id_fk" FOREIGN KEY ("subcategory_id") REFERENCES "public"."subcategories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_drafts" ADD CONSTRAINT "place_drafts_district_id_districts_id_fk" FOREIGN KEY ("district_id") REFERENCES "public"."districts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_drafts" ADD CONSTRAINT "place_drafts_region_id_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_drafts" ADD CONSTRAINT "place_drafts_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_drafts" ADD CONSTRAINT "place_drafts_approved_place_id_places_id_fk" FOREIGN KEY ("approved_place_id") REFERENCES "public"."places"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_feedback" ADD CONSTRAINT "place_feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_feedback" ADD CONSTRAINT "place_feedback_place_cache_id_place_cache_id_fk" FOREIGN KEY ("place_cache_id") REFERENCES "public"."place_cache"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_products" ADD CONSTRAINT "place_products_place_cache_id_place_cache_id_fk" FOREIGN KEY ("place_cache_id") REFERENCES "public"."place_cache"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_products" ADD CONSTRAINT "place_products_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "places" ADD CONSTRAINT "places_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planners" ADD CONSTRAINT "planners_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regions" ADD CONSTRAINT "regions_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_service_plan_id_service_plans_id_fk" FOREIGN KEY ("service_plan_id") REFERENCES "public"."service_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_planner_id_planners_id_fk" FOREIGN KEY ("planner_id") REFERENCES "public"."planners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_relations" ADD CONSTRAINT "service_relations_specialist_id_specialists_id_fk" FOREIGN KEY ("specialist_id") REFERENCES "public"."specialists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_relations" ADD CONSTRAINT "service_relations_traveler_id_users_id_fk" FOREIGN KEY ("traveler_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sos_events" ADD CONSTRAINT "sos_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sos_events" ADD CONSTRAINT "sos_events_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "specialists" ADD CONSTRAINT "specialists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subcategories" ADD CONSTRAINT "subcategories_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travel_companions" ADD CONSTRAINT "travel_companions_order_id_service_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."service_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "travel_companions" ADD CONSTRAINT "travel_companions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_activities" ADD CONSTRAINT "trip_activities_trip_day_id_trip_days_id_fk" FOREIGN KEY ("trip_day_id") REFERENCES "public"."trip_days"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_days" ADD CONSTRAINT "trip_days_trip_plan_id_trip_plans_id_fk" FOREIGN KEY ("trip_plan_id") REFERENCES "public"."trip_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_plans" ADD CONSTRAINT "trip_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_locations" ADD CONSTRAINT "user_locations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "IDX_cart_items_user" ON "cart_items" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "IDX_chat_invites_code" ON "chat_invites" USING btree ("invite_code");--> statement-breakpoint
CREATE INDEX "IDX_chat_invites_conversation" ON "chat_invites" USING btree ("conversation_sid");--> statement-breakpoint
CREATE INDEX "IDX_collections_user_place" ON "collections" USING btree ("user_id","place_name","district");--> statement-breakpoint
CREATE INDEX "IDX_collections_official_place" ON "collections" USING btree ("official_place_id");--> statement-breakpoint
CREATE INDEX "IDX_commerce_orders_user" ON "commerce_orders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "IDX_commerce_orders_session" ON "commerce_orders" USING btree ("stripe_session_id");--> statement-breakpoint
CREATE INDEX "IDX_invites_order" ON "companion_invites" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "IDX_invites_code" ON "companion_invites" USING btree ("invite_code");--> statement-breakpoint
CREATE INDEX "IDX_districts_region" ON "districts" USING btree ("region_id");--> statement-breakpoint
CREATE INDEX "IDX_klook_products_name" ON "klook_products" USING btree ("name_normalized");--> statement-breakpoint
CREATE INDEX "IDX_klook_products_region" ON "klook_products" USING btree ("region");--> statement-breakpoint
CREATE INDEX "IDX_merchant_place_links_lookup" ON "merchant_place_links" USING btree ("place_name","district","city");--> statement-breakpoint
CREATE INDEX "IDX_merchant_place_links_merchant" ON "merchant_place_links" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "IDX_merchant_place_links_google_place_id" ON "merchant_place_links" USING btree ("google_place_id");--> statement-breakpoint
CREATE INDEX "IDX_merchant_place_links_official" ON "merchant_place_links" USING btree ("official_place_id");--> statement-breakpoint
CREATE INDEX "IDX_message_highlights_conversation" ON "message_highlights" USING btree ("conversation_sid");--> statement-breakpoint
CREATE INDEX "IDX_message_highlights_message" ON "message_highlights" USING btree ("message_sid");--> statement-breakpoint
CREATE INDEX "IDX_place_applications_merchant" ON "place_applications" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "IDX_place_applications_status" ON "place_applications" USING btree ("status");--> statement-breakpoint
CREATE INDEX "IDX_place_applications_draft" ON "place_applications" USING btree ("place_draft_id");--> statement-breakpoint
CREATE INDEX "IDX_place_cache_lookup" ON "place_cache" USING btree ("sub_category","district","city","country");--> statement-breakpoint
CREATE INDEX "IDX_place_drafts_merchant" ON "place_drafts" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "IDX_place_drafts_status" ON "place_drafts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "IDX_place_drafts_district" ON "place_drafts" USING btree ("district_id");--> statement-breakpoint
CREATE INDEX "IDX_place_drafts_source" ON "place_drafts" USING btree ("source");--> statement-breakpoint
CREATE INDEX "IDX_place_feedback_lookup" ON "place_feedback" USING btree ("user_id","place_name","district","city");--> statement-breakpoint
CREATE INDEX "IDX_place_products_place" ON "place_products" USING btree ("place_cache_id");--> statement-breakpoint
CREATE INDEX "IDX_place_products_merchant" ON "place_products" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "IDX_places_google_place_id" ON "places" USING btree ("google_place_id");--> statement-breakpoint
CREATE INDEX "IDX_places_city_district" ON "places" USING btree ("city","district");--> statement-breakpoint
CREATE INDEX "IDX_places_category" ON "places" USING btree ("category");--> statement-breakpoint
CREATE INDEX "IDX_places_merchant" ON "places" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "IDX_planners_user" ON "planners" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "IDX_planners_available" ON "planners" USING btree ("is_available");--> statement-breakpoint
CREATE INDEX "IDX_regions_country" ON "regions" USING btree ("country_id");--> statement-breakpoint
CREATE INDEX "IDX_orders_user" ON "service_orders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "IDX_orders_planner" ON "service_orders" USING btree ("planner_id");--> statement-breakpoint
CREATE INDEX "IDX_orders_status" ON "service_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "IDX_service_relations_specialist" ON "service_relations" USING btree ("specialist_id");--> statement-breakpoint
CREATE INDEX "IDX_service_relations_traveler" ON "service_relations" USING btree ("traveler_id");--> statement-breakpoint
CREATE INDEX "IDX_session_expire" ON "sessions" USING btree ("expire");--> statement-breakpoint
CREATE INDEX "IDX_sos_events_user" ON "sos_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "IDX_sos_events_status" ON "sos_events" USING btree ("status");--> statement-breakpoint
CREATE INDEX "IDX_specialists_region" ON "specialists" USING btree ("service_region");--> statement-breakpoint
CREATE INDEX "IDX_subcategories_category" ON "subcategories" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "IDX_transactions_merchant" ON "transactions" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "IDX_companions_order" ON "travel_companions" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "IDX_companions_user" ON "travel_companions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "IDX_trip_activities_day" ON "trip_activities" USING btree ("trip_day_id");--> statement-breakpoint
CREATE INDEX "IDX_trip_days_plan" ON "trip_days" USING btree ("trip_plan_id");--> statement-breakpoint
CREATE INDEX "IDX_trip_plans_user" ON "trip_plans" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "IDX_trip_plans_status" ON "trip_plans" USING btree ("status");--> statement-breakpoint
CREATE INDEX "IDX_user_locations_user" ON "user_locations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "IDX_user_locations_sharing" ON "user_locations" USING btree ("is_sharing_enabled");