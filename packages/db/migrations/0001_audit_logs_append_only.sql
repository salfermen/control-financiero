-- Auditoría de solo inserción: ningún proceso puede reescribir el historial.
-- DELETE se permite solo para retención y para el derecho de supresión del
-- titular (borrado de cuenta), que lo hace el servicio de borrado.
CREATE OR REPLACE FUNCTION audit_logs_block_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs es de solo inserción: UPDATE no permitido'
    USING ERRCODE = 'insufficient_privilege';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER audit_logs_no_update
  BEFORE UPDATE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION audit_logs_block_update();
--> statement-breakpoint
-- Lo mismo para el histórico de tasas: una tasa publicada no se edita.
CREATE OR REPLACE FUNCTION exchange_rates_block_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'exchange_rates es histórico de solo inserción: UPDATE no permitido'
    USING ERRCODE = 'insufficient_privilege';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER exchange_rates_no_update
  BEFORE UPDATE ON "exchange_rates"
  FOR EACH ROW EXECUTE FUNCTION exchange_rates_block_update();
