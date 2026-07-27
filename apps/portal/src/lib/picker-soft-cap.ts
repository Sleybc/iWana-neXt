/**
 * ADR-064 — excepción permanente para pickers / selects / combobox de formularios.
 * No son tablas operativas: soft-cap 100 (máx. API), sin «Cargar más» y sin drenar
 * el universo con paginación en bucle. Si el control es tabla operativa densa,
 * aplicar anatomía canónica (cursor + load-more).
 */
export const PICKER_SOFT_CAP = 100;
