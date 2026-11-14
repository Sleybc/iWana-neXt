/** Correo registrado del titular para los envíos de Facturación (spec 2026-11-13 D5, D10). */
export interface BillingTitularContact {
  /** El suscriptor existe en el tenant y no está borrado. */
  exists: boolean;
  /** Suprimido o con supresión en curso: nunca se le envía nada (CA-6). */
  anonymized: boolean;
  /** Party del titular, para consultar sus marcas de privacidad (DATOS_BLOQUEADOS). */
  partyId: string | null;
  /**
   * Correo registrado en claro, solo en memoria; null si no tiene, si está anonimizado o si no se
   * pudo descifrar. Nunca se persiste ni se loguea.
   */
  email: string | null;
}

/**
 * Lectura del correo del titular desde CRM sin que Billing lea tablas ajenas (HLD §8.1 c). El
 * adaptador vive en `crm/contracts/` y se expone por un módulo de lectura.
 */
export abstract class BillingTitularContactReadPort {
  abstract findTitularEmail(subscriberId: string): Promise<BillingTitularContact>;
}
