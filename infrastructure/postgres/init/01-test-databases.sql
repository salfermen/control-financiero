-- Se ejecuta solo la primera vez que se crea el volumen.
-- Bases separadas para pruebas: se borran y recrean en cada ejecución de tests.
CREATE DATABASE finanzas_test OWNER finanzas;
CREATE DATABASE finanzas_e2e_test OWNER finanzas;
