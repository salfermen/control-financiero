/**
 * @cf/domain — núcleo de dominio sin IO.
 *
 * Hoy contiene los datos de referencia (monedas y categorías del sistema).
 * El Financial Engine (tipo Money, conversiones, saldos, flujo de caja) se
 * implementa en la fase F3 dentro de este mismo paquete.
 */
export * from './currencies.js';
export * from './categories.js';
