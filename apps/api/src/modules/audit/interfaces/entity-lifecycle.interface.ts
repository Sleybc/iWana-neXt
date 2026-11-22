/** Altas y bajas de un mes calendario (America/Bogota) de un `entityType` de plataforma. */
export interface EntityLifecycleMonth {
  /** `YYYY-MM`. */
  month: string;
  /** Entidades cuyo primer `CREATE` cae en el mes. */
  created: number;
  /** Entidades distintas con `DELETE` en el mes. */
  removed: number;
}

/**
 * Evento de `public.platform_audit_logs` que informa el estado de una entidad: `status` es
 * `new_value->>'status'` (null si el evento no lo trae, p. ej. `DELETE` del interceptor).
 */
export interface EntityStatusEvent {
  entityId: string;
  action: string;
  status: string | null;
  at: Date;
}
