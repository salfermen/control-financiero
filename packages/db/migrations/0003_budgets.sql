-- F5: presupuestos mensuales con vigencia (ver packages/db/src/schema/budgets.ts).
CREATE TYPE "public"."budget_period" AS ENUM('monthly');--> statement-breakpoint
CREATE TABLE "budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"category_id" uuid,
	"period" "budget_period" DEFAULT 'monthly' NOT NULL,
	"amount" numeric(20, 4) NOT NULL,
	"currency" char(3) NOT NULL,
	"valid_from" date NOT NULL,
	"valid_to" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "budgets_amount_positive" CHECK ("budgets"."amount" > 0),
	CONSTRAINT "budgets_valid_from_month_start" CHECK (extract(day from "budgets"."valid_from") = 1),
	CONSTRAINT "budgets_valid_to_month_end" CHECK ("budgets"."valid_to" IS NULL OR extract(day from ("budgets"."valid_to" + 1)) = 1),
	CONSTRAINT "budgets_valid_range" CHECK ("budgets"."valid_to" IS NULL OR "budgets"."valid_to" >= "budgets"."valid_from")
);
--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_currency_currencies_code_fk" FOREIGN KEY ("currency") REFERENCES "public"."currencies"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "budgets_user_validity_idx" ON "budgets" USING btree ("user_id","valid_from") WHERE "budgets"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "budgets_category_idx" ON "budgets" USING btree ("category_id");--> statement-breakpoint
-- Nunca dos versiones vigentes que se solapen para el mismo usuario y categoría
-- (el presupuesto global usa el UUID nulo como clave). btree_gist permite
-- combinar igualdad de UUID con solapamiento de rangos de fechas; es una
-- extensión «trusted» de PostgreSQL ≥ 13: la crea el dueño de la base sin superusuario.
CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_no_overlap" EXCLUDE USING gist (
	"user_id" WITH =,
	(coalesce("category_id", '00000000-0000-0000-0000-000000000000'::uuid)) WITH =,
	daterange("valid_from", "valid_to", '[]') WITH &&
) WHERE ("deleted_at" IS NULL);
