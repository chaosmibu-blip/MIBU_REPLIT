CREATE TYPE "public"."event_type" AS ENUM('flash', 'holiday');--> statement-breakpoint
CREATE TYPE "public"."user_coupon_status" AS ENUM('active', 'used', 'expired');--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" serial PRIMARY KEY NOT NULL,
	"content" text NOT NULL,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(256) NOT NULL,
	"content" text,
	"event_type" "event_type" NOT NULL,
	"start_date" timestamp NOT NULL,
	"end_date" timestamp NOT NULL,
	"image_url" varchar(512),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_collection" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"place_id" integer NOT NULL,
	"first_acquired_at" timestamp DEFAULT now(),
	"is_new" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "user_coupons" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"coupon_id" integer NOT NULL,
	"acquired_at" timestamp DEFAULT now(),
	"status" "user_coupon_status" DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "gender" varchar(50);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "date_of_birth" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone" varchar(50);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "dietary_restrictions" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "medical_history" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "emergency_contact" jsonb;--> statement-breakpoint
ALTER TABLE "user_collection" ADD CONSTRAINT "user_collection_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_collection" ADD CONSTRAINT "user_collection_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_coupons" ADD CONSTRAINT "user_coupons_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_coupons" ADD CONSTRAINT "user_coupons_coupon_id_coupons_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "IDX_user_collection_user" ON "user_collection" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "IDX_user_collection_place" ON "user_collection" USING btree ("place_id");--> statement-breakpoint
CREATE INDEX "IDX_user_coupons_user" ON "user_coupons" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "IDX_user_coupons_coupon" ON "user_coupons" USING btree ("coupon_id");