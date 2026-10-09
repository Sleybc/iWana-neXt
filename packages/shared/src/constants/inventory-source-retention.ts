/** Edad máxima de los jobs fallidos de las colas de origen de inventario. */
export const INVENTORY_SOURCE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Frecuencia horaria de la limpieza en API y worker. */
export const INVENTORY_SOURCE_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
