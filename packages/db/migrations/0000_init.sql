CREATE TYPE "public"."account_status" AS ENUM('active', 'closed');--> statement-breakpoint
CREATE TYPE "public"."account_type" AS ENUM('checking', 'savings', 'cash', 'digital_wallet', 'investment', 'credit_card', 'loan');--> statement-breakpoint
CREATE TYPE "public"."actor_type" AS ENUM('user', 'system');--> statement-breakpoint
CREATE TYPE "public"."category_kind" AS ENUM('income', 'expense');--> statement-breakpoint
CREATE TYPE "public"."consent_type" AS ENUM('terms_of_service', 'privacy_policy');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('cash', 'debit_card', 'credit_card', 'bank_transfer', 'digital_wallet', 'other');--> statement-breakpoint
CREATE TYPE "public"."record_source" AS ENUM('manual', 'import', 'bank', 'recurring', 'rule');--> statement-breakpoint
CREATE TYPE "public"."session_transport" AS ENUM('cookie', 'bearer');--> statement-breakpoint
CREATE TYPE "public"."sync_status" AS ENUM('synced', 'pending', 'error');--> statement-breakpoint
CREATE TYPE "public"."theme_preference" AS ENUM('system', 'light', 'dark');--> statement-breakpoint
CREATE TYPE "public"."transaction_direction" AS ENUM('inflow', 'outflow');--> statement-breakpoint
CREATE TYPE "public"."transaction_status" AS ENUM('pending', 'posted', 'void');--> statement-breakpoint
CREATE TYPE "public"."transaction_type" AS ENUM('income', 'expense', 'transfer', 'refund', 'payment', 'fee', 'investment');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'pending_deletion', 'disabled');--> statement-breakpoint
CREATE TABLE "consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "consent_type" NOT NULL,
	"version" varchar(20) NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"ip_hash" char(64)
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" char(64) NOT NULL,
	"transport" "session_transport" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"user_agent" varchar(512),
	"ip_hash" char(64),
	CONSTRAINT "sessions_expiry_after_creation" CHECK ("sessions"."expires_at" > "sessions"."created_at")
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"base_currency" char(3) DEFAULT 'COP' NOT NULL,
	"locale" varchar(10) DEFAULT 'es-CO' NOT NULL,
	"timezone" varchar(64) DEFAULT 'America/Bogota' NOT NULL,
	"theme" "theme_preference" DEFAULT 'system' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_settings_locale_supported" CHECK ("user_settings"."locale" IN ('es-CO', 'en-US'))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(254) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"display_name" varchar(80) NOT NULL,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"failed_login_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"email_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_lowercase" CHECK ("users"."email" = lower("users"."email")),
	CONSTRAINT "users_failed_login_non_negative" CHECK ("users"."failed_login_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"parent_id" uuid,
	"kind" "category_kind" NOT NULL,
	"name" varchar(60) NOT NULL,
	"system_key" varchar(60),
	"icon" varchar(40),
	"color" varchar(20),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "categories_system_xor_user" CHECK (("categories"."user_id" IS NULL) = ("categories"."system_key" IS NOT NULL)),
	CONSTRAINT "categories_not_own_parent" CHECK ("categories"."parent_id" IS NULL OR "categories"."parent_id" <> "categories"."id"),
	CONSTRAINT "categories_name_not_blank" CHECK (length(btrim("categories"."name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "currencies" (
	"code" char(3) PRIMARY KEY NOT NULL,
	"name_es" varchar(60) NOT NULL,
	"name_en" varchar(60) NOT NULL,
	"minor_unit" smallint NOT NULL,
	"display_decimals" smallint NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "currencies_code_format" CHECK ("currencies"."code" ~ '^[A-Z]{3}$'),
	CONSTRAINT "currencies_minor_unit_range" CHECK ("currencies"."minor_unit" BETWEEN 0 AND 4),
	CONSTRAINT "currencies_display_decimals_range" CHECK ("currencies"."display_decimals" BETWEEN 0 AND "currencies"."minor_unit")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"actor_type" "actor_type" NOT NULL,
	"action" varchar(64) NOT NULL,
	"entity_type" varchar(64),
	"entity_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"request_id" varchar(64),
	"ip_hash" char(64),
	"user_agent" varchar(512),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exchange_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"base_currency" char(3) NOT NULL,
	"quote_currency" char(3) NOT NULL,
	"rate" numeric(24, 10) NOT NULL,
	"rate_date" date NOT NULL,
	"source" varchar(60) NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exchange_rates_positive" CHECK ("exchange_rates"."rate" > 0),
	CONSTRAINT "exchange_rates_distinct_pair" CHECK ("exchange_rates"."base_currency" <> "exchange_rates"."quote_currency")
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(80) NOT NULL,
	"type" "account_type" NOT NULL,
	"status" "account_status" DEFAULT 'active' NOT NULL,
	"institution_name" varchar(80),
	"currency" char(3) NOT NULL,
	"opening_balance" numeric(20, 4) DEFAULT '0' NOT NULL,
	"opening_balance_date" date NOT NULL,
	"include_in_net_worth" boolean DEFAULT true NOT NULL,
	"source" "record_source" DEFAULT 'manual' NOT NULL,
	"external_id" varchar(128),
	"last_synced_at" timestamp with time zone,
	"sync_status" "sync_status",
	"notes" varchar(2000),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "accounts_id_user_currency_uq" UNIQUE("id","user_id","currency"),
	CONSTRAINT "accounts_name_not_blank" CHECK (length(btrim("accounts"."name")) > 0),
	CONSTRAINT "accounts_source_valid" CHECK ("accounts"."source" IN ('manual', 'import', 'bank'))
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"account_currency" char(3) NOT NULL,
	"category_id" uuid,
	"type" "transaction_type" NOT NULL,
	"direction" "transaction_direction" NOT NULL,
	"status" "transaction_status" DEFAULT 'posted' NOT NULL,
	"transaction_date" date NOT NULL,
	"posted_date" date,
	"description" varchar(255) NOT NULL,
	"merchant_name" varchar(120),
	"payment_method" "payment_method",
	"amount" numeric(20, 4) NOT NULL,
	"original_amount" numeric(20, 4) NOT NULL,
	"original_currency" char(3) NOT NULL,
	"account_fx_rate" numeric(24, 10),
	"base_currency" char(3) NOT NULL,
	"base_amount" numeric(20, 4) NOT NULL,
	"base_fx_rate" numeric(24, 10),
	"fx_rate_id" uuid,
	"fx_source" varchar(60),
	"fx_converted_at" timestamp with time zone,
	"transfer_group_id" uuid,
	"refund_of_id" uuid,
	"source" "record_source" DEFAULT 'manual' NOT NULL,
	"external_id" varchar(128),
	"import_fingerprint" char(64),
	"last_synced_at" timestamp with time zone,
	"sync_status" "sync_status",
	"notes" varchar(2000),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "transactions_amount_positive" CHECK ("transactions"."amount" > 0),
	CONSTRAINT "transactions_original_amount_positive" CHECK ("transactions"."original_amount" > 0),
	CONSTRAINT "transactions_base_amount_positive" CHECK ("transactions"."base_amount" > 0),
	CONSTRAINT "transactions_account_conversion_consistent" CHECK (("transactions"."original_currency" = "transactions"."account_currency" AND "transactions"."account_fx_rate" IS NULL AND "transactions"."amount" = "transactions"."original_amount")
        OR ("transactions"."original_currency" <> "transactions"."account_currency" AND "transactions"."account_fx_rate" IS NOT NULL AND "transactions"."account_fx_rate" > 0)),
	CONSTRAINT "transactions_base_conversion_consistent" CHECK (("transactions"."original_currency" = "transactions"."base_currency" AND "transactions"."base_fx_rate" IS NULL AND "transactions"."base_amount" = "transactions"."original_amount")
        OR ("transactions"."original_currency" <> "transactions"."base_currency" AND "transactions"."base_fx_rate" IS NOT NULL AND "transactions"."base_fx_rate" > 0)),
	CONSTRAINT "transactions_conversion_traceable" CHECK (("transactions"."account_fx_rate" IS NULL AND "transactions"."base_fx_rate" IS NULL)
        OR ("transactions"."fx_source" IS NOT NULL AND "transactions"."fx_converted_at" IS NOT NULL)),
	CONSTRAINT "transactions_direction_matches_type" CHECK (("transactions"."type" IN ('income', 'refund') AND "transactions"."direction" = 'inflow')
        OR ("transactions"."type" IN ('expense', 'fee') AND "transactions"."direction" = 'outflow')
        OR "transactions"."type" IN ('transfer', 'payment', 'investment')),
	CONSTRAINT "transactions_transfer_group_rules" CHECK (("transactions"."type" = 'transfer' AND "transactions"."transfer_group_id" IS NOT NULL)
        OR "transactions"."type" IN ('payment', 'investment')
        OR ("transactions"."type" IN ('income', 'expense', 'refund', 'fee') AND "transactions"."transfer_group_id" IS NULL)),
	CONSTRAINT "transactions_transfer_without_category" CHECK ("transactions"."type" <> 'transfer' OR "transactions"."category_id" IS NULL),
	CONSTRAINT "transactions_refund_link_only_on_refund" CHECK ("transactions"."refund_of_id" IS NULL OR "transactions"."type" = 'refund'),
	CONSTRAINT "transactions_posted_after_transaction" CHECK ("transactions"."posted_date" IS NULL OR "transactions"."posted_date" >= "transactions"."transaction_date"),
	CONSTRAINT "transactions_description_not_blank" CHECK (length(btrim("transactions"."description")) > 0)
);
--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_base_currency_currencies_code_fk" FOREIGN KEY ("base_currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_base_currency_currencies_code_fk" FOREIGN KEY ("base_currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_quote_currency_currencies_code_fk" FOREIGN KEY ("quote_currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_currency_currencies_code_fk" FOREIGN KEY ("currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_original_currency_currencies_code_fk" FOREIGN KEY ("original_currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_base_currency_currencies_code_fk" FOREIGN KEY ("base_currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_fx_rate_id_exchange_rates_id_fk" FOREIGN KEY ("fx_rate_id") REFERENCES "public"."exchange_rates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_refund_of_id_transactions_id_fk" FOREIGN KEY ("refund_of_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_fk" FOREIGN KEY ("account_id","user_id","account_currency") REFERENCES "public"."accounts"("id","user_id","currency") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "consents_user_type_version_uq" ON "consents" USING btree ("user_id","type","version");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_uq" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_system_key_uq" ON "categories" USING btree ("system_key");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_user_kind_name_uq" ON "categories" USING btree ("user_id","kind","name") WHERE "categories"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "categories_user_idx" ON "categories" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "categories_parent_idx" ON "categories" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "audit_logs_user_created_idx" ON "audit_logs" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_logs_action_created_idx" ON "audit_logs" USING btree ("action","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "exchange_rates_source_pair_date_uq" ON "exchange_rates" USING btree ("source","base_currency","quote_currency","rate_date");--> statement-breakpoint
CREATE INDEX "exchange_rates_pair_date_idx" ON "exchange_rates" USING btree ("base_currency","quote_currency","rate_date" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_user_source_external_uq" ON "accounts" USING btree ("user_id","source","external_id");--> statement-breakpoint
CREATE INDEX "accounts_user_active_idx" ON "accounts" USING btree ("user_id") WHERE "accounts"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_user_source_external_uq" ON "transactions" USING btree ("user_id","source","external_id");--> statement-breakpoint
CREATE INDEX "transactions_user_date_idx" ON "transactions" USING btree ("user_id","transaction_date" DESC NULLS LAST) WHERE "transactions"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "transactions_account_date_idx" ON "transactions" USING btree ("account_id","transaction_date");--> statement-breakpoint
CREATE INDEX "transactions_user_category_date_idx" ON "transactions" USING btree ("user_id","category_id","transaction_date");--> statement-breakpoint
CREATE INDEX "transactions_transfer_group_idx" ON "transactions" USING btree ("transfer_group_id");--> statement-breakpoint
CREATE INDEX "transactions_user_fingerprint_idx" ON "transactions" USING btree ("user_id","import_fingerprint");