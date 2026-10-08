-- F4: vigencia de las tasas. La TRM publicada un viernes rige hasta el lunes;
-- fuera de ese rango la tasa se marca como desactualizada.
ALTER TABLE "exchange_rates" ADD COLUMN "valid_until" date;--> statement-breakpoint
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_validity_range" CHECK ("exchange_rates"."valid_until" IS NULL OR "exchange_rates"."valid_until" >= "exchange_rates"."rate_date");