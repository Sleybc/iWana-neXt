import { TenantStatus } from '@iwana/shared';

export interface TenantLifecycleSnapshot {
  id: string;
  slug: string;
  schemaName: string;
  status: TenantStatus;
  deletedAt: Date | null;
}

/** Contrato de lectura del ciclo de vida expuesto por el módulo Tenant. */
export abstract class TenantLifecycleReadPort {
  /** Devuelve solo tenants ACTIVE y no eliminados, ordenados por schemaName. */
  abstract listActiveTenantContexts(): Promise<TenantLifecycleSnapshot[]>;

  /** Devuelve el estado del ciclo de vida sin filtrar status ni deletedAt. */
  abstract findTenantLifecycleById(id: string): Promise<TenantLifecycleSnapshot | null>;
}
